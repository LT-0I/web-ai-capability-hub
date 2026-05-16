const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { runArtifactClick } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type IopDatePeriod = "anytime" | "lastThirtyDays" | "lastTwelveMonths" | "lastFiveYears";
export type IopPubType = "article" | "chapter" | "book";
export type IopAccessType = "open-access";
export type IopOrderBy = "relevance" | "recent" | "oldest";
export type IopExportFormat = "ris" | "bibtex";

export interface IopItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; article_url: string; pdf_url?: string; }
export interface IopSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface IopFilterArgs extends IopSearchArgs { search_date_period?: IopDatePeriod | string; pub_type?: IopPubType | string; access_type?: IopAccessType | string; journal_issn?: string; order_by?: IopOrderBy | string; }
export interface IopExportArgs { doi: string; format?: IopExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const IOP_ORIGIN = "https://iopscience.iop.org";
const VALID_DATE_PERIODS = new Set(["anytime", "lastThirtyDays", "lastTwelveMonths", "lastFiveYears"]);
const VALID_PUB_TYPES = new Set(["article", "chapter", "book"]);
const VALID_ACCESS_TYPES = new Set(["open-access"]);
const VALID_ORDER_BY = new Set(["relevance", "recent", "oldest"]);
const VALID_FORMATS = new Set(["ris", "bibtex"]);

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
  const out = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");
  if (!/^10\.\d{4,9}\//i.test(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi must be a DOI", { doi });
  return out;
}
function normalizeIopIdentifier(identifier: string): string {
  if (!identifier || !identifier.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return identifier.trim().replace(/^https?:\/\/doi\.org\//i, "").replace(/^urn:isbn:/i, "");
}
function isIopIsbnIdentifier(identifier: string): boolean {
  const compact = normalizeIopIdentifier(identifier).replace(/[\s-]/g, "");
  return /^(?:97[89]\d{10}|\d{9}[0-9X])$/i.test(compact);
}
function requireIopIdentifier(identifier: string): string {
  const out = normalizeIopIdentifier(identifier);
  if (isIopIsbnIdentifier(out) || /^10\.\d{4,9}\//i.test(out)) return out;
  throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi must be a DOI or IOP eBook ISBN", { doi: identifier });
}
function escapeRegExp(value: string): string { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeFormat(format?: string): IopExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IOPscience export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as IopExportFormat;
}
function setEnumParam(url: URL, name: string, value: string | undefined, valid: Set<string>): void {
  if (!value) return;
  if (!valid.has(value)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IOPscience ${name}: ${value}`, { [name]: value, valid: [...valid] });
  url.searchParams.set(name, value);
}

export function buildIopSearchUrl(args: IopSearchArgs): string {
  asPositiveInt(args.page_size, "page_size");
  const url = new URL("/nsearch", IOP_ORIGIN);
  url.searchParams.set("terms", requireQuery(args.query));
  url.searchParams.set("fromPage", "results");
  return url.toString();
}

export function buildIopFilterUrl(args: IopFilterArgs): string {
  const url = new URL(buildIopSearchUrl(args));
  setEnumParam(url, "searchDatePeriod", args.search_date_period, VALID_DATE_PERIODS);
  setEnumParam(url, "pubType", args.pub_type, VALID_PUB_TYPES);
  setEnumParam(url, "accessType", args.access_type, VALID_ACCESS_TYPES);
  setEnumParam(url, "orderBy", args.order_by, VALID_ORDER_BY);
  if (args.journal_issn) url.searchParams.set("journals", args.journal_issn);
  return url.toString();
}

export function buildIopArticleUrl(doi: string): string {
  return new URL(`/article/${requireDoi(doi)}`, IOP_ORIGIN).toString();
}

export function buildIopExportUrl(doi: string, format: IopExportFormat | string = "ris"): string {
  const normalized = normalizeFormat(format);
  const identifier = requireIopIdentifier(doi);
  if (isIopIsbnIdentifier(identifier)) {
    const url = new URL("/exportAbstract", IOP_ORIGIN);
    url.searchParams.set("isbn", identifier);
    url.searchParams.set("exportFormat", normalized === "ris" ? "iopexport_ris" : "iopexport_bib");
    url.searchParams.set("exportType", "abs");
    return url.toString();
  }
  const url = new URL("/export", IOP_ORIGIN);
  url.searchParams.set("type", "article");
  url.searchParams.set("doi", identifier);
  url.searchParams.set("exportFormat", normalized === "ris" ? "iopexport_ris" : "iopexport_bib");
  url.searchParams.set("exportType", "abs");
  url.searchParams.set("navsubmit", "Export abstract");
  return url.toString();
}

export function isValidIopRisArtifact(text: string, identifier: string): boolean {
  const source = String(text || "").trim();
  if (!source || /^</.test(source) || /<html|<!doctype|error|not found/i.test(source)) return false;
  const hasRisRecord = /^TY  - [A-Z0-9_]{2,8}\s*$/m.test(source) && /^ER  -\s*$/m.test(source);
  if (!hasRisRecord) return false;
  const id = requireIopIdentifier(identifier);
  if (isIopIsbnIdentifier(id)) return /^TY  - (?:EBOOK|BOOK)\s*$/m.test(source) && new RegExp(`^SN  - ${escapeRegExp(id)}\\s*$`, "mi").test(source);
  return /^TY  - (?:JOUR|EJOUR|CHAP|BOOK|EBOOK)\s*$/m.test(source) && /^DO  - /m.test(source) && source.toLowerCase().includes(id.toLowerCase());
}

export function isValidIopBibtexArtifact(text: string, identifier: string): boolean {
  const source = String(text || "").trim();
  if (!source || /^</.test(source) || /<html|<!doctype|error|not found/i.test(source)) return false;
  const id = requireIopIdentifier(identifier);
  if (isIopIsbnIdentifier(id)) return /@book\s*\{/i.test(source) && new RegExp(`isbn\\s*=\\s*\\{${escapeRegExp(id)}\\}`, "i").test(source);
  return /@article\s*\{/i.test(source) && new RegExp(`doi\\s*=\\s*\\{${escapeRegExp(id)}\\}`, "i").test(source);
}

export function parseIopResultCount(text: string): number {
  const source = String(text || "");
  const direct = /Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i.exec(source);
  if (direct) return Number(direct[1].replace(/,/g, ""));
  const capped = /top\s+([\d,]+)\s+results\s+for/i.exec(source);
  if (capped) return Number(capped[1].replace(/,/g, ""));
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IOPscience result count node was not found", { probe: "Showing 1-10 of N" });
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
function cleanText(value: string): string { return decodeEntities(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function normalizeDoi(value: string): string { return decodeEntities(value).replace(/^https?:\/\/doi\.org\//i, "").replace(/^\/article\//, "").replace(/\/pdf$/i, "").replace(/[?#].*$/, "").replace(/[),.;]+$/, ""); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function authorsFromText(text: string, title: string): string[] {
  const stripped = text.replace(title, " ").split(/\b(?:Abstract|PDF|HTML|References|Cited by|Journal Article|Chapter|Book)\b/i)[0] || "";
  return unique(stripped.split(/,| and /).map((s) => s.trim()).filter((s) => /^[A-Z][A-Za-z.' -]+(?:\s+[A-Z][A-Za-z.' -]+)+$/.test(s))).slice(0, 12);
}
function titleFromBlock(block: string, doi: string): string {
  const exact = new RegExp(`<a[^>]+href=["']/article/${doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)<\\/a>`, "i").exec(block)?.[1];
  return cleanText(exact || /<(?:h\d|a)[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "");
}

export function parseIopItemsFromHtml(html: string): IopItem[] {
  const source = String(html || "");
  const doiMatches = [...source.matchAll(/href=["'](?:https:\/\/doi\.org\/|\/article\/)(10\.\d{4,9}\/[^"'?#/]+(?:\/[^"'?#/]+)*)(?:\/pdf)?[^"']*["']/gi)];
  const dois = unique(doiMatches.map((m) => normalizeDoi(m[1]))).slice(0, 100);
  return dois.map((doi) => {
    const idx = source.search(new RegExp(`(?:https://doi\\.org/|/article/)${doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
    const block = idx >= 0 ? source.slice(Math.max(0, idx - 5000), Math.min(source.length, idx + 5000)) : source;
    const title = titleFromBlock(block, doi) || cleanText(block).slice(0, 160);
    const text = cleanText(block);
    const journal = (/\b(?:[A-Z][A-Za-z&: -]+(?:Letters|Materials|Reports|Science|Technology|Physics|Engineering|Journal|Review|Research))\b/.exec(text)?.[0] || "").trim();
    const article_url = buildIopArticleUrl(doi);
    const hasPdf = new RegExp(`/article/${doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pdf`, "i").test(block);
    return { title, authors: authorsFromText(text, title), doi, journal, year: yearFromText(text), article_url, pdf_url: hasPdf ? `${article_url}/pdf` : undefined };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseIopItemsFromVisibleText(text: string): IopItem[] {
  const source = String(text || "").replace(/\s+/g, " ");
  const dois = unique([...source.matchAll(/(?:https:\/\/doi\.org\/)?(10\.\d{4,9}\/[^\s,;]+)/gi)].map((m) => normalizeDoi(m[1]))).slice(0, 100);
  return dois.map((doi) => {
    const idx = source.indexOf(doi);
    const before = idx >= 0 ? source.slice(Math.max(0, idx - 700), idx) : source;
    const title = (before.split(/\b(?:JOURNAL ARTICLE|CHAPTER|BOOK)\b/i).pop() || before).replace(/^(.*Showing\s+\d+-\d+\s+of\s+[\d,]+)/i, "").trim().slice(0, 180);
    return { title, authors: authorsFromText(before, title), doi, journal: "", year: yearFromText(before), article_url: buildIopArticleUrl(doi) };
  });
}

function isRadwareUrl(url: string): boolean { return /validate\.perfdrive\.com/i.test(url || ""); }
async function assertNotRadware(page: any, url: string): Promise<void> {
  const current = String(page?.url?.() || url || "");
  const title = await page?.title?.().catch(() => "") || "";
  const body = await page?.locator?.("body")?.innerText?.({ timeout: 2000 }).catch(() => "") || "";
  if (isRadwareUrl(current) || /Radware Bot Manager|botmanager_support@radware\.com|validate\.perfdrive\.com/i.test(`${title}\n${body}`)) {
    throw new WebAiToolError(ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, "IOPscience Radware validation page persisted after allowed retry", { url: current, title });
  }
}

async function readIopPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: IopItem[] }> {
  let lastCount = -1;
  let lastItems = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      await assertNotRadware(page, page.url?.() || "");
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseIopResultCount(visibleText);
      const htmlItems = parseIopItemsFromHtml(html);
      const items = htmlItems.length ? htmlItems : parseIopItemsFromVisibleText(visibleText);
      stable = { visibleText, title, html, resultCount, items };
      if (resultCount === lastCount && items.length === lastItems) break;
      lastCount = resultCount;
      lastItems = items.length;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IOPscience results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
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
    if (isRadwareUrl(page.url?.() || "")) throw new WebAiToolError(ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, "IOPscience tab allocation landed on Radware validation page", { url: page.url?.() || url });
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedIopPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    await freeSession(tabId).catch(() => undefined);
    try {
      await allocateResearchSession(profile, url, tabId, cdpPort);
      const launcher = new ManagedBrowserLauncher();
      const status = await launcher.launch({ profile, cdpPort });
      const browser = await launcher.connectOverCdp(status);
      try {
        const page = await activeManagedPage(browser, undefined, tabId);
        await assertNotRadware(page, url);
        return await fn(page);
      } finally {
        await browser.close?.().catch(() => undefined);
        if (!keepTab) await freeSession(tabId).catch(() => undefined);
      }
    } catch (error) {
      lastError = error;
      await freeSession(tabId).catch(() => undefined);
      const msg = error instanceof Error ? error.message : String(error);
      const code = (error as any)?.errorCode;
      if (attempt === 0 && (code === ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED || /validate\.perfdrive\.com|Radware|ERR_NAME_NOT_RESOLVED/i.test(msg))) {
        await sleep(1500);
        continue;
      }
      break;
    }
  }
  if (lastError instanceof WebAiToolError) throw lastError;
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IOPscience tab allocation/navigation failed", { url, cause: lastError instanceof Error ? lastError.message : String(lastError) });
}

export async function researchIopSearch(args: IopSearchArgs): Promise<{ result_count: number; items: IopItem[]; query_url: string }> {
  const query_url = buildIopSearchUrl(args);
  const profile = args.profile || "nuaa-iop";
  const tabId = args.tab_id || `research-iop-search-${Date.now()}`;
  const page = await withAllocatedIopPage(profile, query_url, tabId, args.cdp_port ?? 9240, (p) => readIopPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchIopFilter(args: IopFilterArgs): Promise<{ result_count: number; items: IopItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildIopFilterUrl(args);
  const profile = args.profile || "nuaa-iop";
  const tabId = args.tab_id || `research-iop-filter-${Date.now()}`;
  const page = await withAllocatedIopPage(profile, refined_url, tabId, args.cdp_port ?? 9240, (p) => readIopPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

async function downloadIopBookExport(exportUrl: string, downloadDir: string, format: IopExportFormat, identifier: string): Promise<string> {
  const ext = format === "ris" ? "ris" : "bib";
  const artifactPath = path.join(downloadDir, `iop-${identifier.replace(/[^A-Za-z0-9]+/g, "-")}.${ext}`);
  const data: Buffer = await new Promise((resolve, reject) => {
    https.get(exportUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, (res: any) => {
      const status = Number(res.statusCode || 0);
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (status < 200 || status >= 300) {
          reject(new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IOPscience eBook export endpoint did not return an artifact", { export_url: exportUrl, status }));
          return;
        }
        resolve(body);
      });
    }).on("error", (error: Error) => reject(new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IOPscience eBook export download failed", { export_url: exportUrl, cause: error.message })));
  });
  fs.writeFileSync(artifactPath, data);
  return artifactPath;
}

export async function researchIopExport(args: IopExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: IopExportFormat; doi: string; export_url: string }> {
  const doi = requireIopIdentifier(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "nuaa-iop";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "iop"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const exportUrl = buildIopExportUrl(doi, format);
  if (isIopIsbnIdentifier(doi)) {
    try {
      const artifact_path = await downloadIopBookExport(exportUrl, downloadDir, format, doi);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && !isValidIopRisArtifact(text, doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IOPscience eBook RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !isValidIopBibtexArtifact(text, doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IOPscience eBook BibTeX artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, export_url: exportUrl };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IOPscience eBook export failed", { doi, format, cause: error?.message || String(error) });
    }
  }
  const articleUrl = buildIopArticleUrl(doi);
  const tabId = args.tab_id || `research-iop-export-${Date.now()}`;
  return await withAllocatedIopPage(profile, articleUrl, tabId, args.cdp_port ?? 9240, async (page) => {
    try {
      for (let i = 0; i < 3; i++) {
        await assertNotRadware(page, articleUrl);
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (/Citations|BibTeX|RIS/i.test(text)) break;
        await sleep(3000);
      }
      const buttonSelector = format === "ris" ? 'a[aria-label="RIS of citation and abstract"]' : 'a[aria-label="BibTeX of citation and abstract"]';
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: `iopscience.iop.org/article/${doi}`,
        buttonSelector,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : "*.bib"
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && !isValidIopRisArtifact(text, doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IOPscience RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !isValidIopBibtexArtifact(text, doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IOPscience BibTeX artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, export_url: exportUrl };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : /validate\.perfdrive\.com|Radware|challenge|captcha/i.test(raw) ? ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "IOPscience export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
