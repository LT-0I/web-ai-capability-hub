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

export type AiaaArea = "AllField" | "Title" | "Contrib" | "Keyword" | "AbstractText" | "Affiliation";
export type AiaaExportFormat = "ris" | "bibtex" | "endnote" | "medlars";

export interface AiaaItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; }
export interface AiaaSearchArgs { query: string; area?: AiaaArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface AiaaFilterArgs extends AiaaSearchArgs { after_year?: number; before_year?: number; series_key?: string; contrib_raw?: string; concept_id?: string; access?: boolean; }
export interface AiaaExportArgs { doi: string; format?: AiaaExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const AIAA_ORIGIN = "https://arc.aiaa.org";
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"]);
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "medlars"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): AiaaArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported AIAA search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as AiaaArea;
}
function normalizeFormat(format?: string): AiaaExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported AIAA export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as AiaaExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildAiaaSearchUrl(args: AiaaSearchArgs): string {
  const url = new URL("/action/doSearch", AIAA_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildAiaaFilterUrl(args: AiaaFilterArgs): string {
  const url = new URL(buildAiaaSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.series_key) url.searchParams.set("SeriesKey", args.series_key);
  if (args.contrib_raw) url.searchParams.set("ContribRaw", args.contrib_raw);
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  if (args.access) url.searchParams.set("access", "on");
  return url.toString();
}

export function buildAiaaCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", AIAA_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseAiaaResultCount(text: string): number {
  const direct = /Search Results\s*\(([\d,]+)\)/i.exec(text || "");
  const fallback = /Results:\s*\d+\s*-\s*\d+\s*of\s*([\d,]+)/i.exec(text || "");
  const raw = direct?.[1] || fallback?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIAA result count node was not found", { probe: "Search Results (N)" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.2514\/[^\s<]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeDate = text.split(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:19\d{2}|20\d{2})\b/)[0] || "";
  return beforeDate.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^Full Access|Abstract|Read Now|First Page$/i.test(s)).slice(0, 12);
}

export function parseAiaaItemsFromHtml(html: string): AiaaItem[] {
  const blocks = [...String(html || "").matchAll(/<[^>]+class=["'][^"']*search__item[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*search__item|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const doi = doiFromText(cleanText(block));
    const title = cleanText(/<(?:h\d|a)[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "") || cleanText(block).split(/\s+https:\/\/doi\.org\//)[0].slice(0, 160);
    const text = cleanText(block).replace(title, "");
    const year = yearFromText(text);
    const journal = (text.match(/(?:Journal of [A-Za-z &]+|AIAA [A-Za-z0-9 -]+ Forum|Progress in Astronautics and Aeronautics|[0-9]+(?:st|nd|rd|th) [A-Za-z /-]+Conference)/)?.[0] || "").trim();
    return { title, authors: authorsFromText(text), doi, journal, year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseAiaaItemsFromVisibleText(text: string): AiaaItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Search Results \([\d,]+\)/i).pop() || normalized;
  const pieces = tail.split(/\s+Full Access\s+/).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(`https://doi.org/${doi}`)[0] : piece;
    const year = yearFromText(beforeDoi);
    const title = beforeDoi.split(/\s+[A-Z][A-Za-z. -]+(?:,| and )|\s+\b(?:19\d{2}|20\d{2})\b/)[0].replace(/^(Export Citations|Add to Favorites|Recommend)\s+/, "").trim();
    const journal = beforeDoi.slice(Math.max(0, beforeDoi.length - 140)).replace(/^.*\d{4}/, "").trim();
    const authorPart = beforeDoi.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, journal, year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readAiaaPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: AiaaItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseAiaaResultCount(visibleText);
      const items = parseAiaaItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseAiaaItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIAA results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedAiaaPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "AIAA tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchAiaaSearch(args: AiaaSearchArgs): Promise<{ result_count: number; items: AiaaItem[]; query_url: string }> {
  const query_url = buildAiaaSearchUrl(args);
  const profile = args.profile || "research-aiaa";
  const tabId = args.tab_id || `research-aiaa-search-${Date.now()}`;
  const page = await withAllocatedAiaaPage(profile, query_url, tabId, args.cdp_port, (p) => readAiaaPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchAiaaFilter(args: AiaaFilterArgs): Promise<{ result_count: number; items: AiaaItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildAiaaFilterUrl(args);
  const profile = args.profile || "research-aiaa";
  const tabId = args.tab_id || `research-aiaa-filter-${Date.now()}`;
  const page = await withAllocatedAiaaPage(profile, refined_url, tabId, args.cdp_port, (p) => readAiaaPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchAiaaExport(args: AiaaExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: AiaaExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-aiaa";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "aiaa"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const citationUrl = buildAiaaCitationUrl(doi);
  const tabId = args.tab_id || `research-aiaa-export-${Date.now()}`;
  return await withAllocatedAiaaPage(profile, citationUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 3; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (/DOWNLOAD CITATION/i.test(text) && /Format/i.test(text)) break;
        await sleep(3000);
      }
      const radio = `#${format}`;
      const count = await page.locator(radio).count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "AIAA citation format radio was not found", { selector: radio });
      const directChecked = await page.locator("#direct").isChecked().catch(() => false);
      if (directChecked) await page.locator("#direct").click({ timeout: 3000 }).catch(() => undefined);
      await page.locator(radio).click({ timeout: 10000 });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: encodeURIComponent(doi),
        buttonSelector: 'input[name="submit"]',
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 10000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "AIAA RIS artifact failed content validation", { artifact_path, doi });
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
      throw new WebAiToolError(code, "AIAA export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
