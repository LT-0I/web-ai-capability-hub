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

export type CellpressArea = "AllField" | "Title" | "Contrib" | "Keyword" | "Abstract" | "AbstractTitleKeywordFilterField";
export type CellpressExportFormat = "ris";
export type CellpressAccess = "full" | "open" | string;

export interface CellpressItem { title: string; authors: string[]; doi: string; pii: string; journal: string; year: number | null; }
export interface CellpressSearchArgs { query: string; area?: CellpressArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface CellpressFilterArgs extends CellpressSearchArgs { content_item_type?: string; after_year?: number; before_year?: number; author?: string; journal?: string; collection?: string; keyword?: string; access?: CellpressAccess; sort_by?: string; }
export interface CellpressExportArgs { pii: string; format?: CellpressExportFormat | string; download_dir?: string; filename?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const CELLPRESS_ORIGIN = "https://www.cell.com";
const DEFAULT_PROFILE = "research-cellpress";
const DEFAULT_CDP_PORT = 9240;
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keyword", "Abstract", "AbstractTitleKeywordFilterField"]);
const VALID_FORMATS = new Set(["ris"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): CellpressArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Cell Press search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as CellpressArea;
}
function normalizeFormat(format?: string): CellpressExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Cell Press export format: ${format}`, { format, valid: [...VALID_FORMATS], note: "Cell Press showCitFormats is RIS-only." });
  return out as CellpressExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requirePii(pii: string): string {
  if (!pii || !pii.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "pii is required");
  return pii.trim();
}
function safeFileToken(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, "").slice(0, 120) || "cellpress"; }
function uniquePath(dir: string, filename: string): string {
  const parsed = path.parse(filename);
  let out = path.join(dir, filename);
  for (let i = 1; fs.existsSync(out); i++) out = path.join(dir, `${parsed.name}-${i}${parsed.ext}`);
  return out;
}

export function normalizeCellpressPiiForObjectUri(pii: string): string {
  return requirePii(pii).replace(/[^A-Za-z0-9]/g, "");
}

export function buildCellpressSearchUrl(args: CellpressSearchArgs): string {
  const url = new URL("/action/doSearch", CELLPRESS_ORIGIN);
  url.searchParams.set("text1", requireQuery(args.query));
  url.searchParams.set("field1", normalizeArea(args.area));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildCellpressFilterUrl(args: CellpressFilterArgs): string {
  const url = new URL(buildCellpressSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (args.content_item_type) url.searchParams.set("ContentItemType", args.content_item_type);
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.author) url.searchParams.set("ContribRaw", args.author);
  if (args.journal) url.searchParams.set("SeriesKey", args.journal);
  if (args.collection) url.searchParams.set("Collection", args.collection);
  if (args.keyword) url.searchParams.set("ConceptID", args.keyword);
  if (args.access === "full") url.searchParams.set("access", "on");
  if (args.access === "open") url.searchParams.set("openAccess", "true");
  if (args.sort_by) url.searchParams.set("sortBy", args.sort_by);
  return url.toString();
}

export function buildCellpressCitationUrl(pii: string): string {
  const url = new URL("/action/showCitFormats", CELLPRESS_ORIGIN);
  url.searchParams.set("pii", requirePii(pii));
  return url.toString();
}

export function buildCellpressDownloadUrl(args: { pii: string; download_file_name?: string; direct?: boolean }): string {
  const url = new URL("/action/downloadCitationSecure", CELLPRESS_ORIGIN);
  url.searchParams.set("objectUri", `pii:${normalizeCellpressPiiForObjectUri(args.pii)}`);
  url.searchParams.set("downloadFileName", args.download_file_name || safeFileToken(normalizeCellpressPiiForObjectUri(args.pii)));
  url.searchParams.set("direct", args.direct === false ? "false" : "true");
  return url.toString();
}

export function parseCellpressResultCount(text: string): number {
  const source = String(text || "").replace(/\s+/g, " ");
  const direct = /Search Results\s+([\d,]+)\s+results/i.exec(source) || /Search Results\s*\(([\d,]+)\)/i.exec(source);
  const raw = direct?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cell Press result count node was not found", { probe: "Search Results N results", reader_mode: "full" });
  return Number(raw.replace(/,/g, ""));
}

function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1016\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function piiFromHref(href: string): string {
  const raw = /[?&]pii=([^&#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw) : "";
}
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:iScience|Cell|Molecular Cell|Current Biology|Neuron|Immunity|Cancer Cell|Cell Reports|Volume\s+\d+|Article|Review|Abstract|Full Text|Preview)\b/i)[0] || "";
  return beforeJournal.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(Article|Review|Published|Views|Citations|Select|Download|Open Access|Export Citation)$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:iScience|Cell Reports(?: Medicine)?|Cell Stem Cell|Molecular Cell|Current Biology|Neuron|Immunity|Cancer Cell|Cell Metabolism|Cell Host & Microbe|Cell Genomics|Cell Chemical Biology|Cell Systems|Developmental Cell|Structure|Joule|Matter|One Earth|Patterns|STAR Protocols|Trends in [A-Za-z &-]+)/)?.[0] || "").trim();
}

export function parseCellpressItemsFromHtml(html: string): CellpressItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<li[^>]+class=["'][^"']*search__item[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*search__item|<\/ul>|$)/gi)].map((m) => m[0]);
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<a[^>]+href=["'][^"']*(?:\/doi\/|showCitFormats\?pii=)[^"']+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?(?=<a[^>]+href=["'][^"']*(?:\/doi\/|showCitFormats\?pii=)|$)/gi)].map((m) => m[0]);
  return fallbackBlocks.map((block) => {
    const title = cleanText(/class=["'][^"']*(?:meta__title|hlFld-Title)[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(block)?.[1] || /<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    const exportHref = /<a[^>]+href=["']([^"']*showCitFormats\?pii=[^"']+)["']/i.exec(block)?.[1] || "";
    return { title, authors: authorsFromText(text), doi: doiFromText(text), pii: piiFromHref(exportHref), journal: journalFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi || item.pii).slice(0, 100);
}

export function parseCellpressItemsFromVisibleText(text: string): CellpressItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1016\/[A-Za-z0-9%().;:_/-]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[,.;]+$/, "");
    const start = Math.max(0, (match.index || 0) - 380);
    const piece = normalized.slice(start, (match.index || 0) + match[0].length);
    const year = yearFromText(piece);
    const titleSource = piece.split(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+\s*(?:,|and)|iScience|Cell Reports|Molecular Cell|Current Biology|Neuron|Volume\s+\d+|\b(?:19\d{2}|20\d{2})\b)/)[0];
    const title = titleSource.replace(/^(?:Order by Relevance|Articles?\s+\d+|Download PDFs?|Abstract|Full Text|Preview|Export Citation|Citation)\s*/i, "").trim();
    return { title, authors: authorsFromText(piece.slice(title.length)), doi, pii: "", journal: journalFromText(piece), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readCellpressPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: CellpressItem[]; url: string }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  const hydrationBackoffs = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5000];
  for (let i = 0; i < hydrationBackoffs.length; i++) {
    try {
      await page.waitForFunction(
        () => /Search Results\s+[\d,]+\s+results/i.test(document.body.innerText),
        { timeout: 25000 },
      );
      const visibleText = await page.locator("body").innerText({ timeout: 15000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseCellpressResultCount(visibleText);
      const htmlItems = parseCellpressItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: htmlItems.length ? htmlItems : parseCellpressItemsFromVisibleText(visibleText), url: page.url?.() || "" };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(hydrationBackoffs[i]);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cell Press results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError), reader_mode: "full" });
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    await page.waitForLoadState?.("networkidle", { timeout: 8000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedCellpressPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Cell Press tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchCellpressSearch(args: CellpressSearchArgs): Promise<{ result_count: number; items: CellpressItem[]; query_url: string; confirm_title: string }> {
  const query_url = buildCellpressSearchUrl(args);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-cellpress-search-${Date.now()}`;
  const page = await withAllocatedCellpressPage(profile, query_url, tabId, args.cdp_port || DEFAULT_CDP_PORT, (p) => readCellpressPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, confirm_title: page.title };
}

export async function researchCellpressFilter(args: CellpressFilterArgs): Promise<{ result_count: number; base_result_count: number; items: CellpressItem[]; refined_url: string; confirm_title: string; refine_mode: "refined_count_delta" | "MODE_UNCERTAIN" }> {
  const base_url = buildCellpressSearchUrl(args);
  const refined_url = buildCellpressFilterUrl(args);
  const profile = args.profile || DEFAULT_PROFILE;
  const baseTabId = `${args.tab_id || `research-cellpress-filter-${Date.now()}`}-base`;
  const refinedTabId = args.tab_id || `research-cellpress-filter-${Date.now()}`;
  const base = await withAllocatedCellpressPage(profile, base_url, baseTabId, args.cdp_port || DEFAULT_CDP_PORT, (p) => readCellpressPage(p));
  const page = await withAllocatedCellpressPage(profile, refined_url, refinedTabId, args.cdp_port || DEFAULT_CDP_PORT, (p) => readCellpressPage(p));
  const refine_mode = page.resultCount < base.resultCount ? "refined_count_delta" : "MODE_UNCERTAIN";
  return { result_count: page.resultCount, base_result_count: base.resultCount, items: page.items, refined_url, confirm_title: page.title, refine_mode };
}

async function resolveCellpressDownloadUrl(page: any, fallbackPii: string): Promise<{ url: string; downloadFileName: string | null }> {
  const form = await page.evaluate(() => {
    const form = document.querySelector('form[action="/action/downloadCitationSecure"], form[action$="/action/downloadCitationSecure"]') as HTMLFormElement | null;
    if (!form) return null;
    const value = (name: string) => (form.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value || "";
    return { action: form.getAttribute("action") || "/action/downloadCitationSecure", objectUri: value("objectUri"), downloadFileName: value("downloadFileName"), direct: value("direct") || "true" };
  }).catch(() => null);
  if (!form?.objectUri) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cell Press citation export form was not found", { selector: 'form[action="/action/downloadCitationSecure"]' });
  const url = new URL(form.action || "/action/downloadCitationSecure", CELLPRESS_ORIGIN);
  url.searchParams.set("objectUri", form.objectUri || `pii:${normalizeCellpressPiiForObjectUri(fallbackPii)}`);
  url.searchParams.set("downloadFileName", form.downloadFileName || safeFileToken(normalizeCellpressPiiForObjectUri(fallbackPii)));
  url.searchParams.set("direct", form.direct || "true");
  return { url: url.toString(), downloadFileName: form.downloadFileName || null };
}

function doiFromRis(text: string): string {
  return /^DO\s+-\s+(.+)$/mi.exec(text)?.[1]?.trim() || "";
}

export async function researchCellpressExport(args: CellpressExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: CellpressExportFormat; pii: string; doi: string; source_url: string; mime_type: string | null }> {
  const pii = requirePii(args.pii);
  const format = normalizeFormat(args.format);
  const profile = args.profile || DEFAULT_PROFILE;
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "cellpress"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-cellpress-export-${Date.now()}`;
  const citationUrl = buildCellpressCitationUrl(pii);
  return await withAllocatedCellpressPage(profile, citationUrl, tabId, args.cdp_port || DEFAULT_CDP_PORT, async (page) => {
    try {
      try {
        await page.waitForSelector('form[action="/action/downloadCitationSecure"], form[action$="/action/downloadCitationSecure"]', { timeout: 25000 });
        await page.waitForFunction(
          () => /RIS format|Export citations/i.test(document.body.innerText),
          { timeout: 25000 },
        );
      } catch {
        throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Cell Press citation export form did not hydrate", { selector: 'form[action="/action/downloadCitationSecure"]' });
      }
      const resolved = await resolveCellpressDownloadUrl(page, pii);
      const response = await page.request.get(resolved.url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Cell Press downloadCitationSecure returned a non-OK status", { status: response.status?.(), source_url: resolved.url });
      const headers = response.headers?.() || {};
      const body = Buffer.from(await response.body());
      const filename = args.filename || `cellpress-${safeFileToken(normalizeCellpressPiiForObjectUri(pii))}.${format}`;
      const artifact_path = uniquePath(downloadDir, filename);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^TY  - JOUR/m.test(text) || !/^ER  -/m.test(text) || !/^DO  - /m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Cell Press RIS artifact failed content validation", { artifact_path, pii });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, pii, doi: doiFromRis(text), source_url: resolved.url, mime_type: headers["content-type"] || null };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "Cell Press export failed", { pii, format, cause: error?.message || String(error) });
    }
  });
}
