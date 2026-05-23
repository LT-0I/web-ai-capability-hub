const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { runArtifactClick } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type DegruyterBooleanMode = "all" | "any";
export type DegruyterSortBy = "relevance" | "mostrecent" | "leastrecent" | "alphabetical" | "reversealpha";
export type DegruyterVisibility = "explicit" | "open" | "public" | "available" | "all";
export type DegruyterExportFormat = "ris" | "bibtex" | "endnote";

export interface DegruyterItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; url: string; }
export interface DegruyterSearchArgs { title?: string; family_name?: string; reference?: string; match?: DegruyterBooleanMode | string; min_pub_year?: number; max_pub_year?: number; document_types?: string[]; sort_by?: DegruyterSortBy | string; document_visibility?: DegruyterVisibility | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface DegruyterFilterArgs extends DegruyterSearchArgs { document_type_facet?: string; subject?: string; publisher?: string; language?: string; access?: DegruyterVisibility | string; pub_date?: string; }
export interface DegruyterExportArgs { doi: string; format?: DegruyterExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const DEGRUYTER_ORIGIN = "https://www.degruyterbrill.com";
const VALID_MATCH = new Set(["all", "any"]);
const VALID_SORT = new Set(["relevance", "mostrecent", "leastrecent", "alphabetical", "reversealpha"]);
const VALID_VISIBILITY = new Set(["explicit", "open", "public", "available", "all"]);
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote"]);
const FORMAT_PATH: Record<DegruyterExportFormat, string> = { ris: "RIS", bibtex: "BibTeX", endnote: "EndNote" };
const FORMAT_EXTENSION: Record<DegruyterExportFormat, string> = { ris: "ris", bibtex: "bib", endnote: "enw" };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function asYear(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1500 || n > 2500) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a four-digit year`, { [name]: value });
  return n;
}
function normalizeMatch(match?: string): DegruyterBooleanMode {
  const out = (match || "all").toLowerCase();
  if (!VALID_MATCH.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported De Gruyter match mode: ${match}`, { match, valid: [...VALID_MATCH] });
  return out as DegruyterBooleanMode;
}
function normalizeSort(sort?: string): DegruyterSortBy {
  const out = (sort || "relevance").toLowerCase();
  if (!VALID_SORT.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported De Gruyter sort: ${sort}`, { sort, valid: [...VALID_SORT] });
  return out as DegruyterSortBy;
}
function normalizeVisibility(visibility?: string): DegruyterVisibility {
  const out = (visibility || "available").toLowerCase();
  if (!VALID_VISIBILITY.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported De Gruyter visibility: ${visibility}`, { visibility, valid: [...VALID_VISIBILITY] });
  return out as DegruyterVisibility;
}
function normalizeFormat(format?: string): DegruyterExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported De Gruyter export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as DegruyterExportFormat;
}
function requireSearchTerms(args: DegruyterSearchArgs): void {
  if (![args.title, args.family_name, args.reference].some((s) => s && String(s).trim())) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "At least one of title, family_name, or reference is required");
  }
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}
function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function escapeQueryTerm(value: string): string { return String(value || "").trim().replace(/[()]/g, " ").replace(/\s+/g, " "); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1515\/[A-Za-z0-9._;()/:+-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  return String(text || "").split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(Abstract|PDF|HTML|Preview|Open Access|Published|Search|Results)$/i.test(s)).slice(0, 12);
}

export function buildDegruyterLuceneQuery(args: DegruyterSearchArgs): string {
  requireSearchTerms(args);
  const clauses: string[] = [];
  if (args.title?.trim()) clauses.push(`title:(${escapeQueryTerm(args.title)})`);
  if (args.family_name?.trim()) clauses.push(`familyName:(${escapeQueryTerm(args.family_name)})`);
  if (args.reference?.trim()) clauses.push(`reference:(${escapeQueryTerm(args.reference)})`);
  const joiner = normalizeMatch(args.match) === "any" ? " OR " : " AND ";
  let query = clauses.length > 1 ? `(${clauses.join(joiner)})` : clauses[0];
  const from = asYear(args.min_pub_year, "min_pub_year");
  const to = asYear(args.max_pub_year, "max_pub_year");
  if (from || to) query += ` AND pubDate:[${from ? `${from}-01-01` : "*"} TO ${to ? `${to}-12-31` : "*"}]`;
  return query;
}

export function buildDegruyterSearchUrl(args: DegruyterSearchArgs): string {
  const url = new URL("/search", DEGRUYTER_ORIGIN);
  url.searchParams.set("query", buildDegruyterLuceneQuery(args));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("sortBy", normalizeSort(args.sort_by));
  url.searchParams.set("documentVisibility", normalizeVisibility(args.document_visibility));
  for (const type of args.document_types || []) if (type) url.searchParams.append("documentTypeFacet", type);
  return url.toString();
}

export function buildDegruyterFilterUrl(args: DegruyterFilterArgs): string {
  const url = new URL(buildDegruyterSearchUrl(args));
  if (args.document_type_facet) url.searchParams.set("documentTypeFacet", args.document_type_facet);
  if (args.subject) url.searchParams.set("subject", args.subject);
  if (args.publisher) url.searchParams.set("publisher", args.publisher);
  if (args.language) url.searchParams.set("language", args.language);
  if (args.access) url.searchParams.set("documentVisibility", normalizeVisibility(args.access));
  if (args.pub_date) url.searchParams.set("pubDate", args.pub_date);
  return url.toString();
}

export function buildDegruyterDocumentUrl(doi: string): string { return new URL(`/document/doi/${requireDoi(doi)}/html`, DEGRUYTER_ORIGIN).toString(); }
export function buildDegruyterCitationUrl(doi: string, format?: string): string { return new URL(`/document/doi/${requireDoi(doi)}/machineReadableCitation/${FORMAT_PATH[normalizeFormat(format)]}`, DEGRUYTER_ORIGIN).toString(); }

export function parseDegruyterResultCount(text: string): number {
  const raw = /\b[\d,]+\s+of\s+([\d,]+)\s+results\b/i.exec(text || "")?.[1]
    || /\b([\d,]+)\s+results\s+for\b/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "De Gruyter result count node was not found", { probe: "N of M results" });
  return Number(raw.replace(/,/g, ""));
}

export function parseDegruyterItemsFromHtml(html: string): DegruyterItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<[^>]+class=["'][^"']*searchResult[^"']*["'][^>]*[\s\S]*?(?=<[^>]+class=["'][^"']*searchResult|<\/body>|$)/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const dataDoi = /data-doi=["']([^"']+)["']/i.exec(block)?.[1] || "";
    const hrefDoi = /href=["'][^"']*\/document\/doi\/([^"']+)\/html/i.exec(block)?.[1]?.replace(/%2F/gi, "/") || "";
    const doi = dataDoi || hrefDoi || doiFromText(text);
    const href = /href=["']([^"']*\/document\/doi\/[^"']+\/html)["']/i.exec(block)?.[1] || (doi ? `/document/doi/${doi}/html` : "");
    const title = cleanText(/<(?:h\d|a)[^>]*(?:class=["'][^"']*(?:title|resultTitle|hlFld-Title)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Authors?|Published|In:|DOI:|https?:\/\/doi\.org\/)/i)[0].trim().slice(0, 260);
    const publication = (/\b(?:In|Journal):\s*(.*?)(?:\s+Published|\s+DOI:|$)/i.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\b(?:In|Journal|Published|DOI):\b|https?:\/\/doi\.org\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text), url: href.startsWith("http") ? href : new URL(href || "/", DEGRUYTER_ORIGIN).toString() };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseDegruyterItemsFromVisibleText(text: string): DegruyterItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1515\/[A-Za-z0-9._;()/:+-]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[),.;]+$/, "");
    const start = Math.max(0, match.index! - 500);
    const chunk = normalized.slice(start, match.index! + doi.length + 250);
    const beforeDoi = chunk.split(doi)[0];
    const titlePart = beforeDoi.replace(/^.*?(?:results for .*?|Sort by|Filter Results|Access Document type Date Subject Publisher Language)\s+/i, "");
    const title = titlePart.split(/\s+(?:Abstract|Published|In:|Authors?:|By\s+)/i)[0].trim().slice(0, 260);
    return { title, authors: authorsFromText(titlePart.slice(title.length)), doi, publication: "", year: yearFromText(chunk), url: buildDegruyterDocumentUrl(doi) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readDegruyterResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: DegruyterItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseDegruyterResultCount(visibleText);
      const items = parseDegruyterItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseDegruyterItemsFromVisibleText(visibleText) };
      if (/\b[\d,]+\s+of\s+[\d,]+\s+results\b/i.test(visibleText) && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "De Gruyter results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function allocateResearchSession(profile: string, url: string, tabId: string, cdpPort?: number): Promise<void> {
  const registry = new TabRegistry(getStoragePaths().dataDir);
  const existing = await registry.get(tabId);
  if (existing?.status === "active") throw new Error(`Tab ID "${tabId}" is already allocated`);
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, cdpPort });
  const browser = await launcher.connectOverCdp(status);
  try {
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedDegruyterPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "De Gruyter tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
  }
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, cdpPort });
  const browser = await launcher.connectOverCdp(status);
  try {
    const page = await activeManagedPage(browser, undefined, tabId);
    return await fn(page);
  } finally {
    await browser.close?.().catch(() => undefined);
    if (!keepTab) await freeSession(tabId).catch(() => undefined);
  }
}

export async function researchDegruyterSearch(args: DegruyterSearchArgs): Promise<{ result_count: number; items: DegruyterItem[]; query_url: string; confirm_url: string; confirm_title: string }> {
  const query_url = buildDegruyterSearchUrl(args);
  const profile = args.profile || "research-degruyter";
  const tabId = args.tab_id || `research-degruyter-search-${Date.now()}`;
  const page = await withAllocatedDegruyterPage(profile, query_url, tabId, args.cdp_port, (p) => readDegruyterResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchDegruyterFilter(args: DegruyterFilterArgs): Promise<{ result_count: number; items: DegruyterItem[]; refined_url: string; confirm_url: string; confirm_title: string }> {
  const refined_url = buildDegruyterFilterUrl(args);
  const profile = args.profile || "research-degruyter";
  const tabId = args.tab_id || `research-degruyter-filter-${Date.now()}`;
  const page = await withAllocatedDegruyterPage(profile, refined_url, tabId, args.cdp_port, (p) => readDegruyterResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchDegruyterExport(args: DegruyterExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: DegruyterExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-degruyter";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "degruyter"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const documentUrl = buildDegruyterDocumentUrl(doi);
  const tabId = args.tab_id || `research-degruyter-export-${Date.now()}`;
  return await withAllocatedDegruyterPage(profile, documentUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 6; i++) {
        const buttonCount = await page.locator("#citationsModalButton").count().catch(() => 0);
        if (buttonCount) break;
        await sleep(3000);
      }
      const buttonCount = await page.locator("#citationsModalButton").count().catch(() => 0);
      if (!buttonCount) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "De Gruyter citation modal button was not found", { selector: "#citationsModalButton", doi });
      await page.locator("#citationsModalButton").click({ timeout: 10000 }).catch(async () => {
        await page.evaluate(() => (document.querySelector("#citationsModalButton") as HTMLElement | null)?.click());
      });
      const selector = `#citationsModal a.action-button[href$='/machineReadableCitation/${FORMAT_PATH[format]}']`;
      for (let i = 0; i < 6; i++) {
        const count = await page.locator(selector).count().catch(() => 0);
        if (count >= 1) break;
        await sleep(3000);
      }
      const count = await page.locator(selector).count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "De Gruyter citation export link was not found", { selector, doi, format });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "degruyterbrill.com/document/doi/",
        buttonSelector: selector,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 15000,
        frameMinCount: 0,
        filenamePattern: `*.${FORMAT_EXTENSION[format]}`
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "De Gruyter RIS artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "De Gruyter export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
