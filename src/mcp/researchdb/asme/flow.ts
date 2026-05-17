const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { runArtifactClick } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type AsmeFacetKind = "format" | "publisher" | "subjects" | "journal" | "topics";
export type AsmeExportFormat = "ris" | "bibtex" | "endnote" | "refworks";

export interface AsmeItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; }
export interface AsmeSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface AsmeFilterArgs extends AsmeSearchArgs { format?: string; publisher?: string; subject?: string; journal?: string; topic?: string; from_date?: string; to_date?: string; }
export interface AsmeExportArgs { doi: string; format?: AsmeExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const ASME_ORIGIN = "https://asmedigitalcollection.asme.org";
const DOI_ORIGIN = "https://doi.org";
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "refworks"]);
const FORMAT_TO_CITATION: Record<AsmeExportFormat, number> = { ris: 0, endnote: 1, bibtex: 2, refworks: 3 };
const FORMAT_TO_EXTENSION: Record<AsmeExportFormat, string> = { ris: "*.ris", endnote: "*.enw", bibtex: "*.bibtex", refworks: "*" };
const FACET_PARAMS: Record<AsmeFacetKind, string> = {
  format: "fl_ContentType",
  publisher: "fl_Publisher",
  subjects: "fl_Subjects",
  journal: "fl_Journal",
  topics: "fl_Topics"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}
function normalizeFormat(format?: string): AsmeExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ASME export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as AsmeExportFormat;
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
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1115\/[A-Za-z0-9.\-_/]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function normalizeFacetValue(value: string): string { return value.replace(/_/g, " ").trim(); }
function authorsFromText(text: string): string[] {
  const cleaned = text.replace(/\b(?:Free|Open Access|View Article|Open the PDF|Published Online|Journal:|Publisher:|Article Type:)\b.*$/i, "");
  return cleaned.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(JOURNAL|ARTICLES?|PROCEEDINGS|Free)$/i.test(s)).slice(0, 12);
}

export function buildAsmeSearchUrl(args: AsmeSearchArgs): string {
  const url = new URL("/search-results", ASME_ORIGIN);
  url.searchParams.set("page", "1");
  url.searchParams.set("q", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildAsmeFilterUrl(args: AsmeFilterArgs): string {
  const url = new URL(buildAsmeSearchUrl(args));
  if (args.format) url.searchParams.set(FACET_PARAMS.format, normalizeFacetValue(args.format));
  if (args.publisher) url.searchParams.set(FACET_PARAMS.publisher, normalizeFacetValue(args.publisher));
  if (args.subject) url.searchParams.set(FACET_PARAMS.subjects, normalizeFacetValue(args.subject));
  if (args.journal) url.searchParams.set(FACET_PARAMS.journal, normalizeFacetValue(args.journal));
  if (args.topic) url.searchParams.set(FACET_PARAMS.topics, normalizeFacetValue(args.topic));
  if (args.from_date) url.searchParams.set("fromDate", args.from_date);
  if (args.to_date) url.searchParams.set("ToDate", args.to_date);
  return url.toString();
}

export function buildAsmeDoiUrl(doi: string): string { return new URL(requireDoi(doi), `${DOI_ORIGIN}/`).toString(); }
export function buildAsmeCitationDownloadPath(resourceId: string | number, format?: string): string {
  const normalized = normalizeFormat(format);
  const url = new URL("/Citation/Download", ASME_ORIGIN);
  url.searchParams.set("resourceId", String(resourceId));
  url.searchParams.set("resourceType", "3");
  url.searchParams.set("citationFormat", String(FORMAT_TO_CITATION[normalized]));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function parseAsmeResultCount(text: string): number {
  const raw = /1\s*-\s*\d+\s+of\s+([\d,]+)/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASME result count node was not found", { probe: "1-N of total" });
  return Number(raw.replace(/,/g, ""));
}

export function parseAsmeItemsFromHtml(html: string): AsmeItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<(?:div|article|li)[^>]+class=["'][^"']*(?:al-search-result|search-result|sr-list|issue-item|item-results|result)[^"']*["'][^>]*>([\s\S]*?)(?=<(?:div|article|li)[^>]+class=["'][^"']*(?:al-search-result|search-result|sr-list|issue-item|item-results|result)|$)/gi)].map((m) => m[1]);
  const sourceBlocks = blocks.length ? blocks : body.split(/\b(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\b/i).slice(1);
  return sourceBlocks.map((block) => {
    const text = cleanText(block);
    const doi = doiFromText(text);
    const title = cleanText(/<(?:h\d|a)[^>]*(?:class=["'][^"']*(?:title|item-title|hlFld-Title)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Free|Journal:|Publisher:|J\. |https:\/\/doi\.org\/10\.1115\/)/i)[0].trim().slice(0, 220);
    const publication = (/Journal:\s*([^]+?)(?:\s+Publisher:|\s+Article Type:|\s+J\.)/i.exec(text)?.[1] || /\b(J\.[A-Za-z0-9 .,&-]+)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)/i.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\bJournal:\b|\bPublisher:\b|\bArticle Type:\b|\bhttps:\/\/doi\.org\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseAsmeItemsFromVisibleText(text: string): AsmeItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const resultTail = normalized.split(/1\s*-\s*\d+\s+of\s+[\d,]+\s+Search Results[^]*?Sort Order Select/i).pop() || normalized;
  const pieces = (resultTail.match(/(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+[\s\S]*?(?=\s+(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+|$)/gi) || []).filter((piece) => /10\.1115\//i.test(piece));
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(`https://doi.org/${doi}`)[0] : piece;
    const afterLabel = beforeDoi.replace(/^(JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+/i, "");
    const title = afterLabel.split(/\s+(?:Free|Open Access|Journal:\s)/)[0].trim().slice(0, 260);
    const publication = (/Journal:\s*(.*?)\s+Publisher:/i.exec(piece)?.[1] || "").trim();
    const authorPart = afterLabel.slice(title.length).split(/\bJournal:\b|\bPublisher:\b|\bArticle Type:\b/i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(piece) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

function resourceIdFromUrl(url: string): string {
  const match = /\/article\/[^?#]+\/(\d+)(?:\/|$)/i.exec(url || "");
  if (!match) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASME resourceId was not found in article URL", { url });
  return match[1];
}

async function readAsmeResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: AsmeItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseAsmeResultCount(visibleText);
      const items = parseAsmeItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseAsmeItemsFromVisibleText(visibleText) };
      if (/Search Results \| ASME Digital Collection/i.test(title) && stable.items.length) break;
    } catch (error) { lastError = error; }
    await sleep(4000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASME results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function readAsmeArticlePage(page: any, doi: string): Promise<{ title: string; url: string; resourceId: string }> {
  let last: any;
  for (let i = 0; i < 6; i++) {
    const title = await page.title().catch(() => "");
    const url = page.url?.() || "";
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    last = { title, url, text: text.slice(0, 500) };
    if (/asmedigitalcollection\.asme\.org/i.test(url) && /Cite/i.test(text) && text.includes(doi)) return { title, url, resourceId: resourceIdFromUrl(url) };
    await sleep(4000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASME article page did not hydrate with Cite control", { doi, last });
}

async function allocateResearchSession(profile: string, url: string, tabId: string, cdpPort?: number): Promise<void> {
  const registry = new TabRegistry(getStoragePaths().dataDir);
  const existing = await registry.get(tabId);
  if (existing?.status === "active") throw new Error(`Tab ID "${tabId}" is already allocated`);
  const launcher = new ManagedBrowserLauncher();
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

async function withAllocatedAsmePage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ASME tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
  }
  const launcher = new ManagedBrowserLauncher();
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

export async function researchAsmeSearch(args: AsmeSearchArgs): Promise<{ result_count: number; items: AsmeItem[]; query_url: string }> {
  const query_url = buildAsmeSearchUrl(args);
  const profile = args.profile || "research-asme";
  const tabId = args.tab_id || `research-asme-search-${Date.now()}`;
  const page = await withAllocatedAsmePage(profile, query_url, tabId, args.cdp_port, (p) => readAsmeResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchAsmeFilter(args: AsmeFilterArgs): Promise<{ result_count: number; items: AsmeItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildAsmeFilterUrl(args);
  const profile = args.profile || "research-asme";
  const tabId = args.tab_id || `research-asme-filter-${Date.now()}`;
  const page = await withAllocatedAsmePage(profile, refined_url, tabId, args.cdp_port, (p) => readAsmeResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchAsmeExport(args: AsmeExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: AsmeExportFormat; doi: string; resource_id: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-asme";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "asme"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-asme-export-${Date.now()}`;
  return await withAllocatedAsmePage(profile, buildAsmeDoiUrl(doi), tabId, args.cdp_port, async (page) => {
    try {
      const article = await readAsmeArticlePage(page, doi);
      const followUpPath = buildAsmeCitationDownloadPath(article.resourceId, format);
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "asmedigitalcollection.asme.org",
        buttonSelector: "a.stats-get-citation",
        followUpSelector: `a[href='${followUpPath}']`,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        filenamePattern: FORMAT_TO_EXTENSION[format]
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!/^@article\{/im.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ASME BibTeX artifact failed content validation", { artifact_path, doi });
      }
      if (format === "ris" && (!/^TY  - /m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ASME RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "endnote" && !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ASME EndNote artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, resource_id: article.resourceId };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "ASME export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
