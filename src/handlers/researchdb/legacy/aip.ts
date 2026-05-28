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

export type AipFacetKind = "content_type" | "journal" | "subject" | "article_type" | "book_series" | "issue_section" | "collection";
export type AipExportFormat = "ris" | "bibtex" | "endnote" | "refworks";

export interface AipItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; article_url?: string; resource_id?: string; }
export interface AipSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface AipFilterArgs extends AipSearchArgs { content_type?: string; journal?: string; subject?: string; article_type?: string; book_series?: string; issue_section?: string; collection?: string; from_date?: string; to_date?: string; }
export interface AipExportArgs { doi: string; format?: AipExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const AIP_ORIGIN = "https://pubs.aip.org";
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "refworks"]);
const FORMAT_TO_CITATION: Record<AipExportFormat, number> = { ris: 0, endnote: 1, bibtex: 2, refworks: 3 };
const FORMAT_TO_EXTENSION: Record<AipExportFormat, string> = { ris: "ris", endnote: "enw", bibtex: "bib", refworks: "ris" };
const FACET_PARAMS: Record<AipFacetKind, string> = {
  content_type: "f_ContentType",
  journal: "f_JournalDisplayName",
  subject: "f_Subjects",
  article_type: "f_ArticleTypeDisplayName",
  book_series: "f_BookSeries",
  issue_section: "f_TocHeadingTitle",
  collection: "f_SpecialCollectionProductTitles"
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
function normalizeFormat(format?: string): AipExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported AIP export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as AipExportFormat;
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
function doiFromText(text: string): string { return (/10\.1063\/[A-Za-z0-9.\-_/]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const cleaned = text.replace(/\b(?:Free|Open Access|View Article|Open the PDF|Published Online|Journal:|Publisher:|Article Type:|Issue|Volume)\b.*$/i, "");
  return cleaned.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(JOURNAL|ARTICLES?|PROCEEDINGS|EBOOK|Free)$/i.test(s)).slice(0, 12);
}
function normalizeFacetValue(value: string): string { return value.replace(/_/g, " ").trim(); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "aip"; }
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
function absoluteAipUrl(href: string): string { return new URL(href, AIP_ORIGIN).toString(); }
function encodePathPreservingSlash(value: string): string {
  return String(value || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}
function articleFromAipUrl(url: string, title = ""): { title: string; url: string; resourceId: string } | null {
  try {
    const absolute = absoluteAipUrl(url);
    return { title, url: absolute, resourceId: resourceIdFromArticleUrl(absolute) };
  } catch {
    return null;
  }
}
async function resolveAipArticleFromDoiRedirect(doi: string): Promise<{ title: string; url: string; resourceId: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://doi.org/${encodePathPreservingSlash(doi)}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 web-ai-capability-hub/2.2.0"
      }
    });
    const location = response.headers.get("location") || "";
    return location ? articleFromAipUrl(location) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildAipSearchUrl(args: AipSearchArgs): string {
  const url = new URL("/search-results", AIP_ORIGIN);
  url.searchParams.set("page", "1");
  url.searchParams.set("q", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildAipFilterUrl(args: AipFilterArgs): string {
  const url = new URL(buildAipSearchUrl(args));
  url.searchParams.set("fl_SiteID", "1");
  if (args.content_type) url.searchParams.set(FACET_PARAMS.content_type, normalizeFacetValue(args.content_type));
  if (args.journal) url.searchParams.set(FACET_PARAMS.journal, normalizeFacetValue(args.journal));
  if (args.subject) url.searchParams.set(FACET_PARAMS.subject, normalizeFacetValue(args.subject));
  if (args.article_type) url.searchParams.set(FACET_PARAMS.article_type, normalizeFacetValue(args.article_type));
  if (args.book_series) url.searchParams.set(FACET_PARAMS.book_series, normalizeFacetValue(args.book_series));
  if (args.issue_section) url.searchParams.set(FACET_PARAMS.issue_section, normalizeFacetValue(args.issue_section));
  if (args.collection) url.searchParams.set(FACET_PARAMS.collection, normalizeFacetValue(args.collection));
  if (args.from_date || args.to_date) {
    if (!args.from_date || !args.to_date) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Both from_date and to_date are required for AIP date range filtering");
    url.searchParams.set("rg_PublicationDate", `${args.from_date}-${args.to_date}`);
  }
  return url.toString();
}

export function buildAipCitationDownloadUrl(resourceId: string | number, format?: string): string {
  const normalized = normalizeFormat(format);
  const url = new URL("/Citation/Download", AIP_ORIGIN);
  url.searchParams.set("resourceId", String(resourceId));
  url.searchParams.set("resourceType", "3");
  url.searchParams.set("citationFormat", String(FORMAT_TO_CITATION[normalized]));
  return url.toString();
}

export function parseAipResultCount(text: string): number {
  const raw = /(?:\d[\d,]*\s*[–-]\s*\d[\d,]*\s+of\s+)?([\d,]+)\s+Search\s+Results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIP result count node was not found", { probe: "total Search Results" });
  return Number(raw.replace(/,/g, ""));
}

function resourceIdFromArticleUrl(url: string): string {
  const match = /\/article\/[^?#]+\/(\d+)(?:\/|$)/i.exec(url || "");
  if (!match) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIP resourceId was not found in article URL", { url });
  return match[1];
}

export function parseAipItemsFromHtml(html: string): AipItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<(?:div|article|li)[^>]+class=["'][^"']*(?:al-search-result|search-result|sr-list|issue-item|item-results|result)[^"']*["'][^>]*>([\s\S]*?)(?=<(?:div|article|li)[^>]+class=["'][^"']*(?:al-search-result|search-result|sr-list|issue-item|item-results|result)|$)/gi)].map((m) => m[1]);
  const sourceBlocks = blocks.length ? blocks : body.split(/\b(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\b/i).slice(1);
  return sourceBlocks.map((block) => {
    const text = cleanText(block);
    const doi = doiFromText(text);
    const href = /<a[^>]+href=["']([^"']*\/article\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const article_url = href ? absoluteAipUrl(href.replace(/&amp;/g, "&")) : undefined;
    const title = cleanText(/<(?:h\d|a)[^>]*(?:class=["'][^"']*(?:title|item-title|hlFld-Title)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Free|Open Access|Journal:|Publisher:|https:\/\/doi\.org\/10\.1063\/)/i)[0].trim().slice(0, 260);
    const publication = (/Journal:\s*([^]+?)(?:\s+Publisher:|\s+Article Type:|\s+Volume|\s+Issue|$)/i.exec(text)?.[1] || /\b(Physics of Fluids|Applied Physics Letters|Journal of Applied Physics|The Journal of Chemical Physics|AIP Advances)\b/i.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\bJournal:\b|\bPublisher:\b|\bArticle Type:\b|\bhttps:\/\/doi\.org\//i)[0] || "";
    let resource_id: string | undefined;
    if (article_url) { try { resource_id = resourceIdFromArticleUrl(article_url); } catch { resource_id = undefined; } }
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text), article_url, resource_id };
  }).filter((item) => (item.doi || item.article_url) && !/^Update search$/i.test(item.title)).slice(0, 100);
}

export function parseAipItemsFromVisibleText(text: string): AipItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const resultTail = normalized.split(/1\s*-\s*\d+\s+of\s+[\d,]+\s+Search Results[^]*?Sort Order Select/i).pop() || normalized;
  const pieces = (resultTail.match(/(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+[\s\S]*?(?=\s+(?:JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+|$)/gi) || []).filter((piece) => /10\.1063\//i.test(piece));
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(`https://doi.org/${doi}`)[0] : piece;
    const afterLabel = beforeDoi.replace(/^(JOURNAL ARTICLES|PROCEEDINGS PAPERS|EBOOK CHAPTER)\s+/i, "");
    const title = afterLabel.split(/\s+(?:Free|Open Access|Journal:\s|Physics of Fluids\s+|Applied Physics Letters\s+)/)[0].trim().slice(0, 260);
    const publication = (/Journal:\s*(.*?)\s+(?:Publisher:|Article Type:|Volume|Issue)/i.exec(piece)?.[1] || /\b(Physics of Fluids|Applied Physics Letters|Journal of Applied Physics|The Journal of Chemical Physics|AIP Advances)\b/i.exec(piece)?.[1] || "").trim();
    const authorPart = afterLabel.slice(title.length).split(/\bJournal:\b|\bPublisher:\b|\bArticle Type:\b|\bhttps:\/\/doi\.org\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(piece) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readAipResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: AipItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseAipResultCount(visibleText);
      const items = parseAipItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseAipItemsFromVisibleText(visibleText) };
      if (/Search Results \| AIP Publishing/i.test(title) && Number.isFinite(resultCount) && resultCount >= 0) break;
    } catch (error) { lastError = error; }
    await sleep(4000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIP results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function readAipArticleFromDoiSearch(page: any, doi: string): Promise<{ title: string; url: string; resourceId: string }> {
  let last: any;
  for (let i = 0; i < 6; i++) {
    const title = await page.title().catch(() => "");
    const url = page.url?.() || "";
    const html = await page.content().catch(() => "");
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    const href = await page.locator('a[href*="/article/"]').first().getAttribute("href", { timeout: 2000 }).catch(() => "");
    const articleUrl = href ? absoluteAipUrl(href) : "";
    last = { title, url, articleUrl, text: text.slice(0, 500) };
    if (articleUrl && (text.includes(doi) || html.includes(doi))) return { title, url: articleUrl, resourceId: resourceIdFromArticleUrl(articleUrl) };
    await sleep(4000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIP article URL/resourceId was not found from DOI search", { doi, last });
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedAipPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "AIP tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function fetchAipCitationViaManagedPage(page: any, sourceUrl: string): Promise<Buffer> {
  const result = await page.evaluate(async (url: string) => {
    const response = await fetch(url, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
    const buffer = Array.from(new Uint8Array(await response.arrayBuffer()));
    return { ok: response.ok, status: response.status, statusText: response.statusText, body: buffer };
  }, sourceUrl);
  if (!result?.ok) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "AIP citation download returned a non-OK status", { status: result?.status, statusText: result?.statusText, source_url: sourceUrl });
  return Buffer.from(result.body);
}

export async function researchAipSearch(args: AipSearchArgs): Promise<{ result_count: number; items: AipItem[]; query_url: string }> {
  const query_url = buildAipSearchUrl(args);
  const profile = args.profile || "research-aip";
  const tabId = args.tab_id || `research-aip-search-${Date.now()}`;
  const page = await withAllocatedAipPage(profile, query_url, tabId, args.cdp_port, (p) => readAipResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchAipFilter(args: AipFilterArgs): Promise<{ result_count: number; items: AipItem[]; refined_url: string; confirm_url: string; confirm_title: string }> {
  const refined_url = buildAipFilterUrl(args);
  const profile = args.profile || "research-aip";
  const tabId = args.tab_id || `research-aip-filter-${Date.now()}`;
  const page = await withAllocatedAipPage(profile, refined_url, tabId, args.cdp_port, (p) => readAipResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchAipExport(args: AipExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: AipExportFormat; doi: string; resource_id: string; source_url: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-aip";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "aip"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-aip-export-${Date.now()}`;
  const preResolvedArticle = await resolveAipArticleFromDoiRedirect(doi);
  const startUrl = preResolvedArticle?.url || buildAipSearchUrl({ query: doi });
  return await withAllocatedAipPage(profile, startUrl, tabId, args.cdp_port, async (page) => {
    try {
      const article = preResolvedArticle || await readAipArticleFromDoiSearch(page, doi);
      const source_url = buildAipCitationDownloadUrl(article.resourceId, format);
      const body = await fetchAipCitationViaManagedPage(page, source_url);
      const artifact_path = uniquePath(downloadDir, `aip-${safeFileToken(article.resourceId)}-${format}.${FORMAT_TO_EXTENSION[format]}`);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!/^@article\{/im.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "AIP BibTeX artifact failed content validation", { artifact_path, doi });
      }
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "AIP RIS artifact failed content validation", { artifact_path, doi });
      }
      if ((format === "endnote" || format === "refworks") && !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "AIP citation artifact failed DOI validation", { artifact_path, doi, format });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, resource_id: article.resourceId, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "AIP export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
