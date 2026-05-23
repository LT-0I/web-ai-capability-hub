const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type EmeraldSearchMode = "Any" | "All" | "Exact Phrase";
export type EmeraldExportFormat = "ris" | "bibtex" | "endnote" | "refworks";

export interface EmeraldItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; }
export interface EmeraldSearchArgs { query: string; mode?: EmeraldSearchMode | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface EmeraldFilterArgs extends EmeraldSearchArgs { content_type?: string; subject?: string; case_provider?: string; }
export interface EmeraldExportArgs { doi: string; format?: EmeraldExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const EMERALD_ORIGIN = "https://www.emerald.com";
const DOI_ORIGIN = "https://doi.org";
const VALID_MODES = new Set(["Any", "All", "Exact Phrase"]);
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "refworks"]);
const FORMAT_TO_CITATION: Record<EmeraldExportFormat, number> = { ris: 0, endnote: 1, bibtex: 2, refworks: 3 };
const FORMAT_TO_EXTENSION: Record<EmeraldExportFormat, string> = { ris: "ris", endnote: "enw", bibtex: "bib", refworks: "ris" };

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
function normalizeMode(mode?: string): EmeraldSearchMode {
  const out = mode || "Any";
  if (!VALID_MODES.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Emerald search mode: ${mode}`, { mode, valid: [...VALID_MODES] });
  return out as EmeraldSearchMode;
}
function normalizeFormat(format?: string): EmeraldExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Emerald export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as EmeraldExportFormat;
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
function doiFromText(text: string): string { return (/10\.1108\/[A-Za-z0-9.\-_/]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const cleaned = text.replace(/\b(?:Abstract|Download|View Article|Published|Journal:|Publisher:|Article Type:|Earlycite)\b.*$/i, "");
  return cleaned.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(JOURNAL|ARTICLES?|Open Access|Free)$/i.test(s)).slice(0, 12);
}
function normalizeFacetValue(value: string): string { return value.replace(/_/g, " ").trim(); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "emerald"; }
function uniquePath(dir: string, filename: string): string {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}(${index})${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

export function buildEmeraldSearchUrl(args: EmeraldSearchArgs): string {
  const url = new URL("/search-results", EMERALD_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("hd", `advanced${normalizeMode(args.mode)}`);
  url.searchParams.set("searchType", "advanced");
  url.searchParams.set("page", "1");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildEmeraldFilterUrl(args: EmeraldFilterArgs): string {
  const url = new URL(buildEmeraldSearchUrl(args));
  if (args.content_type) url.searchParams.set("f_ContentType", normalizeFacetValue(args.content_type));
  if (args.subject) url.searchParams.set("f_Subjects", normalizeFacetValue(args.subject));
  if (args.case_provider) url.searchParams.set("f_CaseProvider", normalizeFacetValue(args.case_provider));
  return url.toString();
}

export function buildEmeraldDoiUrl(doi: string): string { return new URL(requireDoi(doi), `${DOI_ORIGIN}/`).toString(); }
export function buildEmeraldArticleUrl(doi: string): string { return new URL(`/insight/content/doi/${requireDoi(doi)}/full/html`, EMERALD_ORIGIN).toString(); }
export function buildEmeraldCitationDownloadUrl(resourceId: string | number, format?: string): string {
  const normalized = normalizeFormat(format);
  const url = new URL("/Citation/Download", EMERALD_ORIGIN);
  url.searchParams.set("resourceId", String(resourceId));
  url.searchParams.set("resourceType", "3");
  url.searchParams.set("citationFormat", String(FORMAT_TO_CITATION[normalized]));
  return url.toString();
}

export function parseEmeraldResultCount(text: string): number {
  const raw = /\b\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+Search Results/i.exec(text || "")?.[1]
    || /of\s+([\d,]+)\s+Search Results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Emerald result count node was not found", { probe: "1-20 of N Search Results" });
  return Number(raw.replace(/,/g, ""));
}

export function parseEmeraldItemsFromHtml(html: string): EmeraldItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<(?:div|article|li)[^>]+class=["'][^"']*(?:search-result|result|item-results|issue-item|al-search-result)[^"']*["'][^>]*>([\s\S]*?)(?=<(?:div|article|li)[^>]+class=["'][^"']*(?:search-result|result|item-results|issue-item|al-search-result)|$)/gi)].map((m) => m[1]);
  const doiBlocks = blocks.length ? blocks : body.split(/https:\/\/doi\.org\//i).slice(0, -1).map((part, index, parts) => `${part} https://doi.org/${/10\.1108\/[A-Za-z0-9.\-_/]+/i.exec(body.split(/https:\/\/doi\.org\//i)[index + 1] || "")?.[0] || ""}`);
  return doiBlocks.map((block) => {
    const text = cleanText(block);
    const doi = doiFromText(text);
    const title = cleanText(/<(?:h\d|a)[^>]*(?:class=["'][^"']*(?:title|item-title|hlFld-Title)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Abstract|Download|https:\/\/doi\.org\/10\.1108\/|DOI:)/i)[0].trim().slice(0, 260);
    const publication = (/\b(?:Journal|Publication):\s*(.*?)(?:\s+Publisher:|\s+Article Type:|\s+ISSN|\s+Published|$)/i.exec(text)?.[1] || /\b([A-Z][A-Za-z &,]+)\s+ISSN\b/.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\b(?:Journal|Publication):\b|\bPublisher:\b|\bArticle Type:\b|\bhttps:\/\/doi\.org\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseEmeraldItemsFromVisibleText(text: string): EmeraldItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1108\/[A-Za-z0-9.\-_/]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[),.;]+$/, "");
    const start = Math.max(0, match.index! - 450);
    const chunk = normalized.slice(start, match.index! + doi.length + 250);
    const beforeDoi = chunk.split(`https://doi.org/${doi}`)[0].split(doi)[0];
    const titlePart = beforeDoi.replace(/^.*?(?:Search Results for .*?|Sort Order Select|Journal Articles|Book Chapters|Case Studies)\s+/i, "");
    const title = titlePart.split(/\s+(?:Abstract|Download|Published|[A-Z][a-z]+\s+[A-Z][a-z]+,|By\s+)/i)[0].trim().slice(0, 260);
    const publication = (/\b(?:Journal|Publication):\s*(.*?)(?:\s+Publisher:|\s+Article Type:|\s+Published|$)/i.exec(chunk)?.[1] || "").trim();
    const authorPart = titlePart.slice(title.length).split(/\b(?:Journal|Publication):\b|\bPublisher:\b|\bArticle Type:\b|\bhttps:\/\/doi\.org\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(chunk) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseEmeraldResourceIdFromHtml(html: string): string {
  const body = String(html || "");
  const hrefMatch = /href=["'][^"']*\/Citation\/Download\?[^"']*resourceId=(\d+)[^"']*["']/i.exec(body)
    || /\/Citation\/Download\?[^\s"'<>]*resourceId=(\d+)/i.exec(body);
  if (hrefMatch) return hrefMatch[1];
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Emerald resourceId was not found in citation links", { probe: "/Citation/Download?resourceId=" });
}
function resourceIdFromUrl(url: string): string | null { return /\/article\/[^?#]+\/(\d+)(?:\/|$)/i.exec(url || "")?.[1] || null; }

async function readEmeraldResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: EmeraldItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseEmeraldResultCount(visibleText);
      const items = parseEmeraldItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseEmeraldItemsFromVisibleText(visibleText) };
      if (/Search Results/i.test(visibleText) && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(4000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Emerald results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function readEmeraldArticlePage(page: any, doi: string): Promise<{ title: string; url: string; resourceId: string }> {
  let last: any;
  for (let i = 0; i < 6; i++) {
    const title = await page.title().catch(() => "");
    const url = page.url?.() || "";
    const html = await page.content().catch(() => "");
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    last = { title, url, text: text.slice(0, 500) };
    const resourceId = resourceIdFromUrl(url) || (() => { try { return parseEmeraldResourceIdFromHtml(html); } catch { return null; } })();
    if (/emerald\.com/i.test(url) && resourceId && (text.includes(doi) || html.includes(doi))) return { title, url, resourceId };
    await sleep(4000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Emerald article page did not hydrate with citation resourceId", { doi, last });
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

async function withAllocatedEmeraldPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Emerald tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchEmeraldSearch(args: EmeraldSearchArgs): Promise<{ result_count: number; items: EmeraldItem[]; query_url: string }> {
  const query_url = buildEmeraldSearchUrl(args);
  const profile = args.profile || "research-emerald";
  const tabId = args.tab_id || `research-emerald-search-${Date.now()}`;
  const page = await withAllocatedEmeraldPage(profile, query_url, tabId, args.cdp_port, (p) => readEmeraldResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchEmeraldFilter(args: EmeraldFilterArgs): Promise<{ result_count: number; items: EmeraldItem[]; refined_url: string; confirm_url: string; confirm_title: string }> {
  const refined_url = buildEmeraldFilterUrl(args);
  const profile = args.profile || "research-emerald";
  const tabId = args.tab_id || `research-emerald-filter-${Date.now()}`;
  const page = await withAllocatedEmeraldPage(profile, refined_url, tabId, args.cdp_port, (p) => readEmeraldResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchEmeraldExport(args: EmeraldExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: EmeraldExportFormat; doi: string; resource_id: string; source_url: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-emerald";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "emerald"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-emerald-export-${Date.now()}`;
  return await withAllocatedEmeraldPage(profile, buildEmeraldArticleUrl(doi), tabId, args.cdp_port, async (page) => {
    try {
      const article = await readEmeraldArticlePage(page, doi);
      const source_url = buildEmeraldCitationDownloadUrl(article.resourceId, format);
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Emerald citation download returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, `emerald-${safeFileToken(article.resourceId)}-${format}.${FORMAT_TO_EXTENSION[format]}`);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!/^@article\{/im.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Emerald BibTeX artifact failed content validation", { artifact_path, doi });
      }
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Emerald RIS artifact failed content validation", { artifact_path, doi });
      }
      if ((format === "endnote" || format === "refworks") && !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Emerald citation artifact failed DOI validation", { artifact_path, doi, format });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, resource_id: article.resourceId, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "Emerald export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
