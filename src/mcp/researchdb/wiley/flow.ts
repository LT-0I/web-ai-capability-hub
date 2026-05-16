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

export type WileyArea = "AllField" | "Title" | "ContribRaw" | "Keyword" | "AbstractText" | "Affiliation" | "Funding";
export type WileyExportFormat = "txt" | "ris" | "endnote" | "bibtex" | "medlars" | "refworks";

export interface WileyItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; }
export interface WileySearchArgs { query: string; area?: WileyArea | string; query2?: string; area2?: WileyArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface WileyFilterArgs extends WileySearchArgs { after_year?: number; before_year?: number; series_key?: string; ppub?: string; concept_id?: string; access?: boolean; }
export interface WileyExportArgs { doi: string; format?: WileyExportFormat; include_abstract?: boolean; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const WILEY_ORIGIN = "https://onlinelibrary.wiley.com";
const VALID_AREAS = new Set(["AllField", "Title", "ContribRaw", "Keyword", "AbstractText", "Affiliation", "Funding"]);
const VALID_FORMATS = new Set(["txt", "ris", "endnote", "bibtex", "medlars", "refworks"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): WileyArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Wiley search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as WileyArea;
}
function normalizeFormat(format?: string): WileyExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Wiley export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as WileyExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildWileySearchUrl(args: WileySearchArgs): string {
  const url = new URL("/action/doSearch", WILEY_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  url.searchParams.set("field2", normalizeArea(args.area2));
  url.searchParams.set("text2", args.query2?.trim() || "");
  url.searchParams.set("field3", "AllField");
  url.searchParams.set("text3", "");
  url.searchParams.set("publication", "");
  url.searchParams.set("Ppub", "");
  url.searchParams.set("startPage", "0");
  url.searchParams.set("pageSize", String(asPositiveInt(args.page_size, "page_size") || 10));
  return url.toString();
}

export function buildWileyFilterUrl(args: WileyFilterArgs): string {
  const url = new URL(buildWileySearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.series_key) url.searchParams.set("SeriesKey", args.series_key);
  if (args.ppub) url.searchParams.set("Ppub", args.ppub);
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  if (args.access) url.searchParams.set("access", "on");
  return url.toString();
}

export function buildWileyCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", WILEY_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseWileyResultCount(text: string): number {
  const source = text || "";
  const raw = /Articles\s*&\s*Chapters\s*\(([\d,]+)\)/i.exec(source)?.[1]
    || /Search Results\s*\(([\d,]+)\)/i.exec(source)?.[1]
    || /Results:\s*\d+\s*-\s*\d+\s*of\s*([\d,]+)/i.exec(source)?.[1]
    || /\b([\d,]+)\s+results\b/i.exec(source)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wiley result count node was not found", { probe: "Articles & Chapters (N) / N results" });
  return Number(raw.replace(/,/g, ""));
}

function decodeEntities(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeEntities(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeDate = text.split(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:19\d{2}|20\d{2})\b|\b(?:Volume|Issue|Pages?)\b/i)[0] || "";
  return beforeDate.split(/,| and |;|\|/).map((s) => s.trim()).filter((s) => s && !/^(Full Access|Open Access|Abstract|Export Citation|Read Now|Get access|PDF|EPDF)$/i.test(s)).slice(0, 12);
}
function publicationFromText(text: string): string {
  return (text.match(/(?:IET [A-Za-z &-]+|Journal of [A-Za-z0-9 &:-]+|[A-Z][A-Za-z0-9 &:-]+ Letters|[A-Z][A-Za-z0-9 &:-]+ Review|[A-Z][A-Za-z0-9 &:-]+ Journal)/)?.[0] || "").trim();
}

export function parseWileyItemsFromHtml(html: string): WileyItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<[^>]+class=["'][^"']*(?:search__item|issue-item|result__item|card__item)[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*(?:search__item|issue-item|result__item|card__item)[^"']*["']|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const title = cleanText(/<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1]
      || /<a[^>]+class=["'][^"']*(?:title|publication_title|hlFld-Title)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1]
      || /<span[^>]+class=["'][^"']*hlFld-Title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1]
      || "") || text.split(/\s+https:\/\/doi\.org\//)[0].slice(0, 180);
    const rest = text.replace(title, "");
    return { title, authors: authorsFromText(rest), doi: doiFromText(text), publication: publicationFromText(rest), year: yearFromText(rest) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseWileyItemsFromVisibleText(text: string): WileyItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Articles\s*&\s*Chapters\s*\([\d,]+\)|[\d,]+\s+results/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=(?:Full Access|Open Access|Free Access|Abstract|Research Article)\s+)/i).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(`https://doi.org/${doi}`)[0] : piece;
    const year = yearFromText(beforeDoi);
    const title = beforeDoi.replace(/^(?:Full Access|Open Access|Free Access|Abstract|Research Article)\s+/i, "").split(/\s+(?:[A-Z][A-Za-z.-]+,|\b(?:19\d{2}|20\d{2})\b|Volume|Issue|Published)/)[0].trim();
    const authorPart = beforeDoi.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, publication: publicationFromText(beforeDoi), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readWileyPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: WileyItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 12000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      if (/请稍候|正在进行安全验证/i.test(title) || /Just a moment|Checking your browser/i.test(visibleText)) throw new Error("Wiley passive security interstitial still hydrating");
      const resultCount = parseWileyResultCount(visibleText);
      const items = parseWileyItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseWileyItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(5000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wiley results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedWileyPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Wiley tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchWileySearch(args: WileySearchArgs): Promise<{ result_count: number; items: WileyItem[]; query_url: string }> {
  const query_url = buildWileySearchUrl(args);
  const profile = args.profile || "nuaa-wiley";
  const tabId = args.tab_id || `research-wiley-search-${Date.now()}`;
  const page = await withAllocatedWileyPage(profile, query_url, tabId, args.cdp_port, (p) => readWileyPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchWileyFilter(args: WileyFilterArgs): Promise<{ result_count: number; items: WileyItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildWileyFilterUrl(args);
  const profile = args.profile || "nuaa-wiley";
  const tabId = args.tab_id || `research-wiley-filter-${Date.now()}`;
  const page = await withAllocatedWileyPage(profile, refined_url, tabId, args.cdp_port, (p) => readWileyPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchWileyExport(args: WileyExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: WileyExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "nuaa-wiley";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "wiley"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const citationUrl = buildWileyCitationUrl(doi);
  const tabId = args.tab_id || `research-wiley-export-${Date.now()}`;
  return await withAllocatedWileyPage(profile, citationUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 6; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (text.includes(`https://doi.org/${doi}`) && /Download/i.test(text)) break;
        await sleep(3000);
      }
      const selector = `input[name="format"][value="${format}"]`;
      const count = await page.locator(selector).count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wiley citation format radio was not found", { selector });
      const directChecked = await page.locator("#direct").isChecked().catch(() => false);
      if (directChecked && !args.include_abstract) await page.locator('label[for="direct"]').click({ timeout: 3000 }).catch(() => undefined);
      if (format !== "ris") await page.locator(`label[for="${format}"]`).click({ timeout: 10000 });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "showCitFormats",
        buttonSelector: 'input[name="submit"]',
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 15000,
        frameMinCount: 0
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Wiley RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format !== "ris" && !text.toLowerCase().includes(doi.toLowerCase())) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Wiley citation artifact failed DOI validation", { artifact_path, doi, format });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "Wiley export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
