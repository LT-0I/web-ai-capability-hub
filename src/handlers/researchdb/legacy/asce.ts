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

export type AsceArea = "AllField" | "Title" | "Contrib" | "Keyword" | "AbstractText" | "Affiliation";
export type AsceExportFormat = "ris" | "bibtex" | "endnote" | "medlars";

export interface AsceItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; }
export interface AsceSearchArgs { query: string; query2?: string; area?: AsceArea | string; area2?: AsceArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface AsceFilterArgs extends AsceSearchArgs { after_year?: number; before_year?: number; content_item_type?: string; contrib_raw?: string; concept_id?: string; publication?: string; }
export interface AsceExportArgs { doi: string; format?: AsceExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const ASCE_ORIGIN = "https://ascelibrary.org";
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
function normalizeArea(area?: string): AsceArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ASCE search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as AsceArea;
}
function normalizeFormat(format?: string): AsceExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ASCE export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as AsceExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildAsceSearchUrl(args: AsceSearchArgs): string {
  const url = new URL("/action/doSearch", ASCE_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  if (args.query2 !== undefined && args.query2 !== null && String(args.query2).trim()) {
    url.searchParams.set("field2", normalizeArea(args.area2));
    url.searchParams.set("text2", String(args.query2).trim());
  }
  url.searchParams.set("ConceptID", "");
  url.searchParams.set("publication", "");
  url.searchParams.set("Ppub", "");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildAsceFilterUrl(args: AsceFilterArgs): string {
  const url = new URL(buildAsceSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.content_item_type) url.searchParams.set("ContentItemType", args.content_item_type);
  if (args.contrib_raw) url.searchParams.set("ContribRaw", args.contrib_raw);
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  if (args.publication) url.searchParams.set("publication", args.publication);
  return url.toString();
}

export function buildAsceCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", ASCE_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseAsceResultCount(text: string): number {
  const source = String(text || "");
  const direct = /\b\d+\s*-\s*\d+\s*of\s*([\d,]+)\s*results?\b/i.exec(source) || /\b\d+\s*-\s*\d+\s*of\s*([\d,]+)\s*results?\s*for\b/i.exec(source) || /\b\d+\s*-\s*\d+\s*of\s*([\d,]+)\s*result\s*for\b/i.exec(source.replace(/\s+/g, ""));
  if (direct?.[1]) return Number(direct[1].replace(/,/g, ""));
  const articleTypeBlock = /ARTICLE TYPE([\s\S]*?)(?:AUTHOR|PUBLICATION|TECHNICAL TOPICS|$)/i.exec(source)?.[1] || "";
  const facetCounts = [...articleTypeBlock.matchAll(/(?:Technical Paper|Chapters\/Proceedings Papers|Discussion|Case Study|Editor's Note|Editorial)\s*([\d,]+)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
  if (facetCounts.length) return facetCounts.reduce((sum, n) => sum + n, 0);
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASCE result count node was not found", { probe: "1 - 20 of N result / ARTICLE TYPE facets" });
}

function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1061\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function doiFromHref(href: string): string {
  const raw = /\/doi\/(?:abs\/|full\/)?([^?#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw).replace(/[,.;]+$/, "") : "";
}
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:Journal of|Proceedings|Transactions of|ASCE-ASME|Practice Periodical)\b/)[0] || "";
  const beforeDate = beforeJournal.split(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b(?:19\d{2}|20\d{2})\b/i).pop() || beforeJournal;
  return beforeDate.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^Full Access|Technical Papers?|Abstract|PDF|Full Text|Articles\/Chapters|Site Information$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:Journal of [A-Za-z &]+|Transactions of the American Society of Civil Engineers|Proceedings[^.;()]*|ASCE-ASME Journal[^.;()]*)/)?.[0] || "").trim();
}

export function parseAsceItemsFromHtml(html: string): AsceItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<[^>]+class=["'][^"']*search__item[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*search__item|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const href = /<a[^>]+href=["']([^"']*\/doi\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const doi = doiFromHref(href) || doiFromText(cleanText(block));
    const title = cleanText(/<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    return { title, authors: authorsFromText(text), doi, journal: journalFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseAsceItemsFromVisibleText(text: string): AsceItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/For selected items:/i).pop() || normalized;
  const pieces = tail.split(/\s+FULL ACCESS/i).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const year = yearFromText(piece);
    const title = piece.split(/\s+(?:Wei |Michael |[A-Z][a-z]+ [A-Z]\.|Journal of|Proceedings|Abstract|PDF|FULL TEXT)/)[0].replace(/^(Technical Papers?|TECHNICAL PAPERS|Case Study|Discussion)[A-Za-z\d, ]*/, "").trim();
    const authorPart = piece.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, journal: journalFromText(piece), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readAscePage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: AsceItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseAsceResultCount(visibleText);
      const items = parseAsceItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseAsceItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASCE results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedAscePage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ASCE tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchAsceSearch(args: AsceSearchArgs): Promise<{ result_count: number; items: AsceItem[]; query_url: string }> {
  const query_url = buildAsceSearchUrl(args);
  const profile = args.profile || "research-asce";
  const tabId = args.tab_id || `research-asce-search-${Date.now()}`;
  const page = await withAllocatedAscePage(profile, query_url, tabId, args.cdp_port, (p) => readAscePage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchAsceFilter(args: AsceFilterArgs): Promise<{ result_count: number; items: AsceItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildAsceFilterUrl(args);
  const profile = args.profile || "research-asce";
  const tabId = args.tab_id || `research-asce-filter-${Date.now()}`;
  const page = await withAllocatedAscePage(profile, refined_url, tabId, args.cdp_port, (p) => readAscePage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchAsceExport(args: AsceExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: AsceExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-asce";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "asce"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const citationUrl = buildAsceCitationUrl(doi);
  const tabId = args.tab_id || `research-asce-export-${Date.now()}`;
  return await withAllocatedAscePage(profile, citationUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 5; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (/Download article citation data/i.test(text) && /Format/i.test(text)) break;
        await sleep(3000);
      }
      const selectCount = await page.locator("#slct_format").count().catch(() => 0);
      if (selectCount) {
        await page.locator("#slct_format").selectOption(format, { timeout: 10000 });
      } else {
        const radio = `#${format}`;
        const count = await page.locator(radio).count().catch(() => 0);
        if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ASCE citation format control was not found", { selector: `#slct_format or ${radio}` });
        await page.locator(radio).click({ timeout: 10000 });
      }
      const direct = page.locator("#direct");
      if (await direct.count().catch(() => 0)) {
        const checked = await direct.isChecked().catch(() => false);
        if (!checked) await direct.click({ timeout: 3000 }).catch(() => undefined);
      }
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
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ASCE RIS artifact failed content validation", { artifact_path, doi });
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
      throw new WebAiToolError(code, "ASCE export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
