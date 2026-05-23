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

export type IetArea = "AllField" | "Title" | "Contrib" | "Keyword" | "Abstract" | "Affiliation";
export type IetExportFormat = "ris" | "endnote" | "bibtex" | "medlars" | "refworks";

export interface IetItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; }
export interface IetSearchArgs { query: string; area?: IetArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface IetFilterArgs extends IetSearchArgs { ppub?: string; after_year?: number; before_year?: number; concept_id?: string; contrib_raw?: string; series_key?: string; alphabet_range?: string; }
export interface IetExportArgs { doi: string; format?: IetExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const IET_ORIGIN = "https://digital-library.theiet.org";
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"]);
const VALID_FORMATS = new Set(["ris", "endnote", "bibtex", "medlars", "refworks"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): IetArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IET Digital Library search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as IetArea;
}
function normalizeFormat(format?: string): IetExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IET Digital Library export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as IetExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}
function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromHref(href: string): string {
  const raw = /\/doi\/(?:abs\/|full\/|epdf\/)?([^?#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw).replace(/[,.;]+$/, "") : "";
}
function doiFromText(text: string): string { return (/10\.1049\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:IET|The Journal of Engineering|Conference on|International Conference|Volume\s+\d+|Issue\s+\d+|Abstract|PDF)\b/i)[0] || "";
  return beforeJournal.split(/,| and | & /).map((s) => s.trim()).filter((s) => s && !/^(Article|Chapter|Published|View|PDF|Abstract|Export|Access)$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:IET [A-Za-z0-9 &-]+|The Journal of Engineering|International Conference on [A-Za-z0-9 &-]+)/)?.[0] || "").trim();
}

export function buildIetSearchUrl(args: IetSearchArgs): string {
  const url = new URL("/action/doSearch", IET_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  url.searchParams.set("field2", "AllField");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildIetFilterUrl(args: IetFilterArgs): string {
  const url = new URL(buildIetSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (args.ppub) url.searchParams.set("Ppub", args.ppub);
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  if (args.contrib_raw) url.searchParams.set("ContribRaw", args.contrib_raw);
  if (args.series_key) url.searchParams.set("SeriesKey", args.series_key);
  if (args.alphabet_range) url.searchParams.set("alphabetRange", args.alphabet_range);
  return url.toString();
}

export function buildIetArticleUrl(doi: string): string {
  return new URL(`/doi/${requireDoi(doi)}`, IET_ORIGIN).toString();
}

export function parseIetResultCount(text: string): number {
  const source = String(text || "").replace(/\s+/g, " ");
  const raw = /\b([\d,]+)\s+results?\b/i.exec(source)?.[1] || /^\s*([\d,]+)\s*$/.exec(source)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET result count node was not found", { probe: ".result__count" });
  return Number(raw.replace(/,/g, ""));
}

export function parseIetItemsFromHtml(html: string): IetItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<li[^>]+class=["'][^"']*search-item[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*search-item|<\/ul>|$)/gi)].map((m) => m[0]);
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?(?=<a[^>]+href=["'][^"']*\/doi\/|$)/gi)].map((m) => m[0]);
  return fallbackBlocks.map((block) => {
    const href = /<a[^>]+href=["']([^"']*\/doi\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const doi = doiFromHref(href) || doiFromText(cleanText(block));
    const title = cleanText(/<h\d[^>]*class=["'][^"']*meta__title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    return { title, authors: authorsFromText(text), doi, journal: journalFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseIetItemsFromVisibleText(text: string): IetItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1049\/[A-Za-z0-9%().;:_/-]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[,.;]+$/, "");
    const start = Math.max(0, (match.index || 0) - 360);
    const piece = normalized.slice(start, (match.index || 0) + match[0].length + 180);
    const title = piece.split(/\s+(?:[A-Z][a-z]+\s+[A-Z][a-z]+\s*(?:,|&|and)|IET |The Journal of Engineering|Volume\s+\d+|https?:\/\/doi\.org)/)[0].replace(/^.*?(?:results?|Sort by|PDF)\s*/i, "").trim();
    const authorPart = piece.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, journal: journalFromText(piece), year: yearFromText(piece) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function dismissIetConsent(page: any): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('#ivcb-banner p.ivcb-dec-buttons-1 a.ivcb-btn.ivcb-btn-primary') as HTMLElement | null;
    if (el && el.offsetParent !== null) el.click();
  }).catch(() => undefined);
}

async function readIetPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: IetItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      await dismissIetConsent(page);
      const snapshot = await page.evaluate(() => {
        const countText = (document.querySelector('.result__count')?.textContent || '').trim();
        const title = document.title || '';
        const html = document.documentElement?.outerHTML || '';
        const visibleText = document.body?.innerText || '';
        const itemCount = document.querySelectorAll('li.search-item.clearfix, li.search-item, div.search-result.doSearch li').length;
        return { countText, title, html, visibleText, itemCount, href: location.href };
      });
      if (/Just a moment|请稍候/i.test(snapshot.title)) throw new Error(`Cloudflare still active: ${snapshot.title}`);
      const resultCount = parseIetResultCount(snapshot.countText || snapshot.visibleText);
      const items = parseIetItemsFromHtml(snapshot.html);
      stable = { visibleText: snapshot.visibleText, title: snapshot.title, html: snapshot.html, resultCount, items: items.length ? items : parseIetItemsFromVisibleText(snapshot.visibleText) };
      if (resultCount === lastCount && (stable.items.length || snapshot.itemCount > 0)) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedIetPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IET tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchIetSearch(args: IetSearchArgs): Promise<{ result_count: number; items: IetItem[]; query_url: string }> {
  const query_url = buildIetSearchUrl(args);
  const profile = args.profile || "research-iet";
  const tabId = args.tab_id || `research-iet-search-${Date.now()}`;
  const page = await withAllocatedIetPage(profile, query_url, tabId, args.cdp_port, (p) => readIetPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchIetFilter(args: IetFilterArgs): Promise<{ result_count: number; items: IetItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildIetFilterUrl(args);
  const profile = args.profile || "research-iet";
  const tabId = args.tab_id || `research-iet-filter-${Date.now()}`;
  const page = await withAllocatedIetPage(profile, refined_url, tabId, args.cdp_port, (p) => readIetPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchIetExport(args: IetExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: IetExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-iet";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "iet"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const articleUrl = buildIetArticleUrl(doi);
  const tabId = args.tab_id || `research-iet-export-${Date.now()}`;
  return await withAllocatedIetPage(profile, articleUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 8; i++) {
        await dismissIetConsent(page);
        const ready = await page.evaluate(() => ({ title: document.title || '', metrics: !!document.querySelector('a[aria-controls="core-collateral-metrics"]') }));
        if (!/Just a moment|请稍候/i.test(ready.title) && ready.metrics) break;
        await sleep(3000);
      }
      const metrics = page.locator('a[aria-controls="core-collateral-metrics"]').first();
      if (!(await metrics.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET Metrics and Citations control was not found", { selector: 'a[aria-controls="core-collateral-metrics"]' });
      await metrics.click({ timeout: 10000 });
      const citations = page.locator('button[aria-controls="tab-citations"]').first();
      if (!(await citations.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET Citations tab control was not found", { selector: 'button[aria-controls="tab-citations"]' });
      await citations.click({ timeout: 10000 });
      let formVisible = false;
      for (let i = 0; i < 8; i++) {
        formVisible = await page.evaluate(() => {
          const form = document.querySelector('form.citation-form') as HTMLElement | null;
          const box = form?.getBoundingClientRect();
          return !!(form && box && box.width > 10 && box.height > 10 && form.offsetParent !== null);
        }).catch(() => false);
        if (formVisible) break;
        await sleep(1000);
      }
      if (!formVisible) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET citation form did not become visible", { selector: "form.citation-form" });
      await page.selectOption('#slct_format', format);
      const selected = await page.evaluate((fmt: string) => (document.querySelector('#slct_format') as HTMLSelectElement | null)?.value === fmt, format).catch(() => false);
      if (!selected) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IET citation format select did not accept the requested format", { selector: "#slct_format", format });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "digital-library.theiet.org/doi/",
        buttonSelector: 'form.citation-form input[name="submit"]',
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined,
        verifyMinBytes: format === "ris" ? 100 : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IET RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !/@\w+\s*\{/m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IET BibTeX artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "IET export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
