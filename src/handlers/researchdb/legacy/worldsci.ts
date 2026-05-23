const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { artifactClickOnPage } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type WorldsciArea = "AllField" | "Title" | "Contrib" | "Keyword" | "Abstract" | "Affiliation";
export type WorldsciExportFormat = "ris" | "bibtex";
export type WorldsciAccess = "full" | "open" | string;

export interface WorldsciItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; }
export interface WorldsciSearchArgs { query: string; area?: WorldsciArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface WorldsciFilterArgs extends WorldsciSearchArgs { pub_type?: string; content_item_type?: string; ppub?: string; after_year?: number; before_year?: number; contrib_raw?: string; concept_id?: string; access?: WorldsciAccess; sort_by?: string; }
export interface WorldsciExportArgs { doi: string; format?: WorldsciExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const WORLDSCI_ORIGIN = "https://www.worldscientific.com";
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"]);
const VALID_FORMATS = new Set(["ris", "bibtex"]);
const DEFAULT_PROFILE = "research-worldsci";
const DEFAULT_CDP_PORT = 9259;

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): WorldsciArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported World Scientific search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as WorldsciArea;
}
function normalizeFormat(format?: string): WorldsciExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported World Scientific export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as WorldsciExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildWorldsciSearchUrl(args: WorldsciSearchArgs): string {
  const url = new URL("/action/doSearch", WORLDSCI_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  url.searchParams.set("field2", "AllField");
  url.searchParams.set("text2", "");
  url.searchParams.set("publication", "");
  url.searchParams.set("Ppub", "");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildWorldsciFilterUrl(args: WorldsciFilterArgs): string {
  const url = new URL(buildWorldsciSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (args.pub_type) url.searchParams.set("PubType", args.pub_type);
  if (args.content_item_type) url.searchParams.set("ContentItemType", args.content_item_type);
  if (args.ppub) url.searchParams.set("Ppub", args.ppub);
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.contrib_raw) url.searchParams.set("ContribRaw", args.contrib_raw);
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  if (args.access === "full") url.searchParams.set("access", "on");
  if (args.access === "open") url.searchParams.set("openAccess", "true");
  if (args.sort_by) url.searchParams.set("sortBy", args.sort_by);
  return url.toString();
}

export function buildWorldsciCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", WORLDSCI_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseWorldsciResultCount(text: string): number {
  const source = String(text || "").replace(/\s+/g, " ");
  const raw = /(?:^|\b)([\d,]+)(?:\s+results?\b|\b)/i.exec(source)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "World Scientific result count node was not found", { probe: ".result__count" });
  return Number(raw.replace(/,/g, ""));
}

function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1142\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function doiFromHref(href: string): string {
  const raw = /\/doi\/(?:abs\/|full\/)?([^?#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw).replace(/[,.;]+$/, "") : "";
}
function authorsFromText(text: string): string[] {
  const beforePublication = text.split(/\b(?:Unmanned Systems|International Journal|Journal of|Volume\s+\d+|Abstract|Full Text|Preview)\b/i)[0] || "";
  return beforePublication.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(Article|Chapter|Published|Views|Citations|Select|Download|Open Access)$/i.test(s)).slice(0, 12);
}
function publicationFromText(text: string): string {
  return (text.match(/(?:Unmanned Systems|International Journal of [A-Za-z &-]+|Journal of [A-Za-z &-]+|[A-Z][A-Za-z &-]+(?:Systems|Science|Engineering|Mathematics|Physics))/)?.[0] || "").trim();
}

export function parseWorldsciItemsFromHtml(html: string): WorldsciItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<li[^>]+class=["'][^"']*search__item[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*search__item|<\/ul>|$)/gi)].map((m) => m[0]);
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?(?=<a[^>]+href=["'][^"']*\/doi\/|$)/gi)].map((m) => m[0]);
  return fallbackBlocks.map((block) => {
    const href = /<a[^>]+href=["']([^"']*\/doi\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const doi = doiFromHref(href) || doiFromText(cleanText(block));
    const title = cleanText(/class=["'][^"']*meta__title[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(block)?.[1] || /<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    return { title, authors: authorsFromText(text), doi, publication: publicationFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseWorldsciItemsFromVisibleText(text: string): WorldsciItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1142\/[A-Za-z0-9%().;:_/-]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[,.;]+$/, "");
    const start = Math.max(0, (match.index || 0) - 360);
    const piece = normalized.slice(start, (match.index || 0) + match[0].length);
    const year = yearFromText(piece);
    const titleSource = piece.split(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+\s*(?:,|and)|Unmanned Systems|International Journal|Journal of|Volume\s+\d+|\b(?:19\d{2}|20\d{2})\b)/)[0];
    const title = titleSource.replace(/^(?:Order by Relevance|Articles?\s+\d+|Download PDFs?|Abstract|Full Text|Preview|Export Citation)\s*/i, "").trim();
    return { title, authors: authorsFromText(piece.slice(title.length)), doi, publication: publicationFromText(piece), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function observeWorldsciPage(page: any): Promise<{ href: string; title: string; resultCountText: string | null; visibleText: string; html: string; items: WorldsciItem[]; cfInterstitial: boolean }> {
  return await page.evaluate(() => {
    const text = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();
    const items = Array.from(document.querySelectorAll("li.search__item")).slice(0, 100).map((el: any) => {
      const link = el.querySelector('a[href*="/doi/"]') as HTMLAnchorElement | null;
      const href = link?.getAttribute("href") || "";
      const doi = decodeURIComponent((/\/doi\/(?:abs\/|full\/)?([^?#]+)/i.exec(href)?.[1] || "")).replace(/[,.;]+$/, "");
      return { title: text(el.querySelector(".meta__title") || link), authors: [], doi, publication: "", year: null };
    });
    const title = document.title || "";
    const bodyText = text(document.body);
    return {
      href: location.href,
      title,
      resultCountText: text(document.querySelector(".result__count")) || null,
      visibleText: bodyText,
      html: document.documentElement?.outerHTML || "",
      items,
      cfInterstitial: /请稍候|Just a moment|__cf_chl_/i.test(`${title} ${location.href} ${bodyText.slice(0, 500)}`)
    };
  });
}

async function readWorldsciPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: WorldsciItem[]; url: string; cfInterstitialObserved: boolean }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  let cfInterstitialObserved = false;
  for (let i = 0; i < 90; i++) {
    try {
      const observed = await observeWorldsciPage(page);
      cfInterstitialObserved = cfInterstitialObserved || observed.cfInterstitial;
      if (observed.href.includes("/action/doSearch") && observed.resultCountText) {
        const resultCount = parseWorldsciResultCount(observed.resultCountText);
        const htmlItems = parseWorldsciItemsFromHtml(observed.html);
        const items = observed.items.length ? observed.items : htmlItems.length ? htmlItems : parseWorldsciItemsFromVisibleText(observed.visibleText);
        stable = { visibleText: observed.visibleText, title: observed.title, html: observed.html, resultCount, items, url: observed.href, cfInterstitialObserved };
        if (resultCount === lastCount) break;
        lastCount = resultCount;
      }
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "World Scientific results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError), cfInterstitialObserved });
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
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedWorldsciPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any, browser: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "World Scientific tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
  }
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, cdpPort });
  const browser = await launcher.connectOverCdp(status);
  try {
    const page = await activeManagedPage(browser, undefined, tabId);
    return await fn(page, browser);
  } finally {
    await browser.close?.().catch(() => undefined);
    if (!keepTab) await freeSession(tabId).catch(() => undefined);
  }
}

export async function researchWorldsciSearch(args: WorldsciSearchArgs): Promise<{ result_count: number; items: WorldsciItem[]; query_url: string; cf_interstitial_observed: boolean }> {
  const query_url = buildWorldsciSearchUrl(args);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-worldsci-search-${Date.now()}`;
  const page = await withAllocatedWorldsciPage(profile, query_url, tabId, args.cdp_port || DEFAULT_CDP_PORT, (p) => readWorldsciPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, cf_interstitial_observed: page.cfInterstitialObserved };
}

export async function researchWorldsciFilter(args: WorldsciFilterArgs): Promise<{ result_count: number; items: WorldsciItem[]; refined_url: string; confirm_title: string; cf_interstitial_observed: boolean }> {
  const refined_url = buildWorldsciFilterUrl(args);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-worldsci-filter-${Date.now()}`;
  const page = await withAllocatedWorldsciPage(profile, refined_url, tabId, args.cdp_port || DEFAULT_CDP_PORT, (p) => readWorldsciPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title, cf_interstitial_observed: page.cfInterstitialObserved };
}

async function waitForCitationForm(page: any): Promise<{ hasForm: boolean; hasButton: boolean; hasRisRadio: boolean; hasBibtexRadio: boolean; cfInterstitialObserved: boolean }> {
  let last: any = {};
  let cfInterstitialObserved = false;
  for (let i = 0; i < 90; i++) {
    last = await page.evaluate(() => {
      const text = (document.body?.textContent || "").replace(/\s+/g, " ").trim();
      const title = document.title || "";
      return {
        hasForm: !!document.querySelector('form[name="frmCitmgr"]'),
        hasButton: document.querySelectorAll('input.btn[value="Download"]').length === 1,
        hasRisRadio: !!document.querySelector('input[name="format"][value="ris"]'),
        hasBibtexRadio: !!document.querySelector('input[name="format"][value="bibtex"], #bibtex'),
        cfInterstitial: /请稍候|Just a moment|__cf_chl_/i.test(`${title} ${location.href} ${text.slice(0, 500)}`)
      };
    }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    cfInterstitialObserved = cfInterstitialObserved || !!last.cfInterstitial;
    if (last.hasForm && last.hasButton) return { ...last, cfInterstitialObserved };
    await sleep(2000);
  }
  return { ...last, cfInterstitialObserved };
}

export async function researchWorldsciExport(args: WorldsciExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: WorldsciExportFormat; doi: string; cf_interstitial_observed: boolean }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || DEFAULT_PROFILE;
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "worldsci"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-worldsci-export-${Date.now()}`;
  const citationUrl = buildWorldsciCitationUrl(doi);
  const exportUrl = `${citationUrl}&webaiTab=${encodeURIComponent(tabId)}`;
  return await withAllocatedWorldsciPage(profile, exportUrl, tabId, args.cdp_port || DEFAULT_CDP_PORT, async (page, browser) => {
    try {
      const ready = await waitForCitationForm(page);
      if (!ready.hasForm) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "World Scientific citation form was not found", { selector: 'form[name="frmCitmgr"]', ready });
      const radioSelector = format === "ris" ? 'input[name="format"][value="ris"]' : 'input[name="format"][value="bibtex"], #bibtex';
      const selected = await page.evaluate((selector: string) => {
        const form = document.querySelector('form[name="frmCitmgr"]') as HTMLFormElement | null;
        const radio = document.querySelector(selector) as HTMLInputElement | null;
        if (!form || !radio) return false;
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        const direct = document.querySelector("#direct") as HTMLInputElement | null;
        if (direct && !direct.checked) {
          direct.checked = true;
          direct.dispatchEvent(new Event("change", { bubbles: true }));
        }
        let download = form.querySelector('input[name="download"]') as HTMLInputElement | null;
        if (!download) {
          download = document.createElement("input");
          download.type = "hidden";
          download.name = "download";
          form.appendChild(download);
        }
        download.value = "true";
        return radio.checked && !!form.querySelector('input[name="download"][value="true"]');
      }, radioSelector).catch(() => false);
      if (!selected) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "World Scientific citation format radio was not found", { selector: radioSelector });
      const clicked = await artifactClickOnPage(browser, page, {
        profile,
        buttonSelector: 'input.btn[value="Download"]',
        downloadDir,
        timeoutMs: 90000,
        locateTimeoutMs: 60000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "World Scientific RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !/@\w+\s*\{/m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "World Scientific BibTeX artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, cf_interstitial_observed: ready.cfInterstitialObserved };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "World Scientific export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
