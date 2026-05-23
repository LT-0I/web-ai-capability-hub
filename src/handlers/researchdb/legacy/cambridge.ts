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

export type CambridgeExportFormat = "ris" | "bibtex" | "word" | "text";
export type CambridgeSort = "relevance" | "title" | "publicationDate" | string;

export interface CambridgeItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; product_id: string; }
export interface CambridgeSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface CambridgeFilterArgs extends CambridgeSearchArgs { product_type?: "JOURNAL_ARTICLE" | "BOOK_PART" | "BOOK" | "ELEMENT" | string; open_access?: string; only_show_available?: boolean; start_year?: number; end_year?: number; sort?: CambridgeSort; }
export interface CambridgeExportArgs { query?: string; product_id?: string; format?: CambridgeExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const CAMBRIDGE_ORIGIN = "https://www.cambridge.org";
const VALID_FORMATS = new Set(["ris", "bibtex", "word", "text"]);
const PRODUCT_TYPES = new Set(["JOURNAL_ARTICLE", "BOOK_PART", "BOOK", "ELEMENT"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function normalizeFormat(format?: string): CambridgeExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Cambridge Core export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as CambridgeExportFormat;
}
function requireQuery(query?: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required; bare /core/search returns 404 on Cambridge Core");
  return query.trim();
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1017\/[A-Za-z0-9.()/-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  return text.split(/,| and |;|\|/).map((s) => s.trim()).filter((s) => s && !/^(Article|Chapter|Book|Published online|Published|Abstract|Citation Tools|Download|Access)$/i.test(s)).slice(0, 12);
}

const CAMBRIDGE_RIS_TYPES = new Set([
  "ABST", "ADVS", "AGGR", "ANCI", "ART", "BILL", "BOOK", "CASE", "CHAP", "COMP",
  "CONF", "CPAPER", "CTLG", "DATA", "DBASE", "DICT", "EJOUR", "ELEC", "ENCYC",
  "GEN", "GOVDOC", "GRANT", "HEAR", "ICOMM", "INPR", "JFULL", "JOUR", "LEGAL",
  "MANSCPT", "MAP", "MGZN", "MPCT", "MULTI", "MUSIC", "NEWS", "PAMP", "PAT",
  "PCOMM", "RPRT", "SER", "SLIDE", "SOUND", "STAND", "STAT", "THES", "UNBILL",
  "UNPB", "VIDEO"
]);

export function isValidCambridgeRisArtifact(text: string): boolean {
  const source = String(text || "").trim();
  if (!source || /^</.test(source) || /<html|<!doctype|error|not found/i.test(source)) return false;
  const type = /^TY  - ([A-Z0-9_]{2,8})\s*$/m.exec(source)?.[1];
  return !!type && CAMBRIDGE_RIS_TYPES.has(type) && /^ER  -\s*$/m.test(source) && /10\.1017\//i.test(source);
}

export function buildCambridgeSearchUrl(args: CambridgeSearchArgs): string {
  const url = new URL("/core/search", CAMBRIDGE_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildCambridgeFilterUrl(args: CambridgeFilterArgs): string {
  const url = new URL(buildCambridgeSearchUrl(args));
  const start = asPositiveInt(args.start_year, "start_year");
  const end = asPositiveInt(args.end_year, "end_year");
  if (args.product_type) {
    if (!PRODUCT_TYPES.has(args.product_type)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Cambridge Core product type: ${args.product_type}`, { valid: [...PRODUCT_TYPES] });
    url.searchParams.set("aggs[productTypes][filters]", args.product_type);
  }
  if (args.open_access) url.searchParams.set("aggs[openAccess][filters]", args.open_access);
  if (args.only_show_available) url.searchParams.set("aggs[onlyShowAvailable][filters]", "true");
  if (start) url.searchParams.set("dateRange.from", String(start));
  if (end) url.searchParams.set("dateRange.to", String(end));
  if (args.sort) url.searchParams.set("sort", String(args.sort));
  return url.toString();
}

export function parseCambridgeResultCount(text: string): number {
  const raw = /([\d,]+)\s+results?\s+for/i.exec(text || "")?.[1] || /([\d,]+)\s+results?\b/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cambridge Core result count was not found", { probe: "N results for" });
  return Number(raw.replace(/,/g, ""));
}

export function parseCambridgeItemsFromHtml(html: string): CambridgeItem[] {
  const blocks = [...String(html || "").matchAll(/<[^>]+data-prod-id=["']([A-Fa-f0-9]{24,32})["'][^>]*>[\s\S]*?(?=<[^>]+data-prod-id=["'][A-Fa-f0-9]{24,32}["']|$)/gi)]
    .map((m) => ({ product_id: m[1], html: m[0] }));
  const seen = new Set<string>();
  const items: CambridgeItem[] = [];
  for (const block of blocks) {
    if (seen.has(block.product_id)) continue;
    seen.add(block.product_id);
    const text = cleanText(block.html);
    const title = cleanText(/<(?:h\d|a)[^>]*(?:class=["'][^"']*(?:title|part-link)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block.html)?.[1] || "") || text.slice(0, 180);
    const doi = doiFromText(text);
    const year = yearFromText(text);
    const journal = (/The [A-Z][A-Za-z .&-]+ Journal|[A-Z][A-Za-z .&-]+ Journal|Journal of [A-Za-z .&-]+/i.exec(text)?.[0] || "").trim();
    items.push({ title, authors: authorsFromText(text.replace(title, "")), doi, journal, year, product_id: block.product_id });
    if (items.length >= 100) break;
  }
  return items.filter((item) => item.title || item.doi || item.product_id);
}

export function parseCambridgeItemsFromVisibleText(text: string): CambridgeItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const afterResults = normalized.split(/results?\s+for/i).pop() || normalized;
  const pieces = afterResults.split(/\bCitation Tools\b/i).slice(1, 26);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const year = yearFromText(piece);
    const title = piece.replace(/^.*?(Article|Chapter|Book)\s+/i, "").split(/\s+Published online:|\s+DOI:|\s+https:\/\/doi\.org/i)[0].trim().slice(0, 180);
    return { title, authors: [], doi, journal: "", year, product_id: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readCambridgePage(page: any, confirmText?: RegExp): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: CambridgeItem[] }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 20000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseCambridgeResultCount(visibleText);
      if (page.url().includes("/core/search") && (!confirmText || confirmText.test(visibleText))) {
        const items = parseCambridgeItemsFromHtml(html);
        stable = { visibleText, title, html, resultCount, items: items.length ? items : parseCambridgeItemsFromVisibleText(visibleText) };
        if (resultCount === lastCount) break;
        lastCount = resultCount;
      }
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cambridge Core results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    await page.locator("#onetrust-reject-all-handler").click({ timeout: 3000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedCambridgePage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Cambridge Core tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchCambridgeSearch(args: CambridgeSearchArgs): Promise<{ result_count: number; items: CambridgeItem[]; query_url: string }> {
  const query_url = buildCambridgeSearchUrl(args);
  const profile = args.profile || "research-cambridge";
  const tabId = args.tab_id || `research-cambridge-search-${Date.now()}`;
  const page = await withAllocatedCambridgePage(profile, query_url, tabId, args.cdp_port, (p) => readCambridgePage(p, /results?\s+for/i));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchCambridgeFilter(args: CambridgeFilterArgs): Promise<{ result_count: number; items: CambridgeItem[]; refined_url: string; confirm_title: string; applied_filter?: string }> {
  const refined_url = buildCambridgeFilterUrl(args);
  const profile = args.profile || "research-cambridge";
  const tabId = args.tab_id || `research-cambridge-filter-${Date.now()}`;
  const confirm = args.product_type === "JOURNAL_ARTICLE" ? /Type:\s*Articles\s*\(/i : undefined;
  const page = await withAllocatedCambridgePage(profile, refined_url, tabId, args.cdp_port, (p) => readCambridgePage(p, confirm));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title, applied_filter: args.product_type };
}

async function openCitationModal(page: any, productId?: string): Promise<string> {
  let id = productId;
  if (!id) {
    id = await page.locator("a.export-citation-component[data-prod-id]").first().getAttribute("data-prod-id", { timeout: 15000 }).catch(() => "") || "";
  }
  if (!id) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cambridge Core export product id was not found", { selector: "a.export-citation-component[data-prod-id]" });
  const selector = `a.export-citation-component[data-prod-id="${id}"]`;
  const count = await page.locator(selector).count().catch(() => 0);
  if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cambridge Core citation tools link was not found", { selector });
  await page.locator(selector).first().click({ timeout: 15000 });
  for (let i = 0; i < 10; i++) {
    const modal = await page.evaluate(() => {
      const el = document.querySelector("#exportCitation") as HTMLElement | null;
      const citation = document.querySelector("#citationText")?.textContent || "";
      if (!el) return { open: false, citation };
      const style = getComputedStyle(el);
      return { open: style.display !== "none" && style.visibility !== "hidden" && el.getAttribute("aria-hidden") !== "true", citation };
    }).catch(() => ({ open: false, citation: "" }));
    if (modal.open && !/Loading citation/i.test(modal.citation || "")) return id;
    await sleep(1000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cambridge Core citation modal did not hydrate", { selector: "#exportCitation" });
}

export async function researchCambridgeExport(args: CambridgeExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: CambridgeExportFormat; product_id: string }> {
  const format = normalizeFormat(args.format);
  const query = args.query || "unmanned aerial vehicle AND control";
  const searchUrl = buildCambridgeSearchUrl({ query });
  const profile = args.profile || "research-cambridge";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "cambridge"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-cambridge-export-${Date.now()}`;
  return await withAllocatedCambridgePage(profile, searchUrl, tabId, args.cdp_port, async (page) => {
    try {
      await readCambridgePage(page, /results?\s+for/i);
      const product_id = await openCitationModal(page, args.product_id);
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "www.cambridge.org/core/search",
        buttonSelector: `#exportCitation a[data-export-type="${format}"]`,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 15000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && !isValidCambridgeRisArtifact(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Cambridge Core RIS artifact failed content validation", { artifact_path, product_id });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, product_id };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "Cambridge Core export failed", { product_id: args.product_id, format, cause: error?.message || String(error) });
    }
  });
}
