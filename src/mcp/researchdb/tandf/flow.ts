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

export type TandfArea = "AllField" | "Title" | "Contrib" | "Keywords" | "Abstract" | "Affiliation" | "Funder";
export type TandfExportFormat = "ris" | "bibtex";

export interface TandfItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; }
export interface TandfSearchArgs { query: string; area?: TandfArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface TandfFilterArgs extends TandfSearchArgs { after_year?: number; before_year?: number; content_item_type?: string; pub_type?: string; journal?: string; access?: "full" | "open" | string; }
export interface TandfExportArgs { doi: string; format?: TandfExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const TANDF_ORIGIN = "https://www.tandfonline.com";
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keywords", "Abstract", "Affiliation", "Funder"]);
const VALID_FORMATS = new Set(["ris", "bibtex"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): TandfArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Taylor & Francis search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as TandfArea;
}
function normalizeFormat(format?: string): TandfExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Taylor & Francis file export format: ${format}`, { format, valid: [...VALID_FORMATS], note: "Recipe verified file downloads for RIS/BibTeX controls; RefWorks is a direct export, not a file artifact." });
  return out as TandfExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildTandfSearchUrl(args: TandfSearchArgs): string {
  const url = new URL("/action/doSearch", TANDF_ORIGIN);
  url.searchParams.set(normalizeArea(args.area), requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildTandfFilterUrl(args: TandfFilterArgs): string {
  const url = new URL(buildTandfSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.content_item_type) url.searchParams.set("ContentItemType", args.content_item_type);
  if (args.pub_type) url.searchParams.set("pubType", args.pub_type);
  if (args.journal) url.searchParams.set("journal", args.journal);
  if (args.access === "full") url.searchParams.set("access", "on");
  if (args.access === "open") url.searchParams.set("openAccess", "true");
  return url.toString();
}

export function buildTandfCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", TANDF_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseTandfResultCount(text: string): number {
  const source = String(text || "").replace(/\s+/g, " ");
  const direct = /Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+results?\s+for\s+search/i.exec(source) || /\b([\d,]+)\s+results?\b/i.exec(source);
  const raw = direct?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Taylor & Francis result count node was not found", { probe: "Showing 1-10 of N results for search" });
  return Number(raw.replace(/,/g, ""));
}

function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1080\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function doiFromHref(href: string): string {
  const raw = /\/doi\/(?:abs\/|full\/)?([^?#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw).replace(/[,.;]+$/, "") : "";
}
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:International Journal|Engineering Applications|Combustion Science|Journal of|Volume\s+\d+|Article\s+\||Abstract|Full Text)\b/i)[0] || "";
  return beforeJournal.split(/,| & | and /).map((s) => s.trim()).filter((s) => s && !/^Article|Published Online|Views|Citations|Select|Download$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:International Journal of [A-Za-z &-]+|Engineering Applications of Computational Fluid Mechanics|Combustion Science and Technology|Journal of [A-Za-z &-]+)/)?.[0] || "").trim();
}

export function parseTandfItemsFromHtml(html: string): TandfItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<[^>]+class=["'][^"']*(?:search__item|art_title|hlFld-Title|resultItem)[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*(?:search__item|art_title|hlFld-Title|resultItem)|$)/gi)].map((m) => m[0]);
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?(?=<a[^>]+href=["'][^"']*\/doi\/|$)/gi)].map((m) => m[0]);
  return fallbackBlocks.map((block) => {
    const href = /<a[^>]+href=["']([^"']*\/doi\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const doi = doiFromHref(href) || doiFromText(cleanText(block));
    const title = cleanText(/<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /class=["'][^"']*hlFld-Title[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    return { title, authors: authorsFromText(text), doi, journal: journalFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseTandfItemsFromVisibleText(text: string): TandfItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Number of results:\s*\d+\s*per page/i).pop() || normalized;
  const doiMatches = [...tail.matchAll(/10\.1080\/[A-Za-z0-9%().;:_/-]+/gi)];
  if (doiMatches.length) {
    return doiMatches.map((match) => {
      const doi = match[0].replace(/[,.;]+$/, "");
      const start = Math.max(0, (match.index || 0) - 320);
      const piece = tail.slice(start, (match.index || 0) + match[0].length);
      const year = yearFromText(piece);
      const titleSource = piece.split(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+\s*(?:,|&)|International Journal|Engineering Applications|Combustion Science|Journal of|Volume\s+\d+)/)[0];
      const title = titleSource.replace(/^(?:Order by Relevance|Articles?\s+\d+|Download PDFs?|Abstract|Full Text)\s*/i, "").trim();
      const authorPart = piece.slice(title.length).trim();
      return { title, authors: authorsFromText(authorPart), doi, journal: journalFromText(piece), year };
    }).filter((item) => item.title || item.doi).slice(0, 100);
  }
  const pieces = tail.split(/\s+Abstract\s+Full Text\s+/i);
  const rawPieces = pieces.length > 1 ? pieces.slice(0, -1) : tail.split(/\s+Article\s+\|\s+Published Online:/i);
  return rawPieces.map((piece) => {
    const doi = doiFromText(piece);
    const year = yearFromText(piece);
    const title = piece.split(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+\s*(?:,|&)|International Journal|Engineering Applications|Combustion Science|Journal of|Volume\s+\d+)/)[0].replace(/^(?:Order by Relevance|Articles?\s+\d+|Download PDFs?)\s*/i, "").trim();
    const authorPart = piece.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, journal: journalFromText(piece), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readTandfPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: TandfItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseTandfResultCount(visibleText);
      const items = parseTandfItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseTandfItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Taylor & Francis results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedTandfPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Taylor & Francis tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchTandfSearch(args: TandfSearchArgs): Promise<{ result_count: number; items: TandfItem[]; query_url: string }> {
  const query_url = buildTandfSearchUrl(args);
  const profile = args.profile || "research-tandf";
  const tabId = args.tab_id || `research-tandf-search-${Date.now()}`;
  const page = await withAllocatedTandfPage(profile, query_url, tabId, args.cdp_port, (p) => readTandfPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchTandfFilter(args: TandfFilterArgs): Promise<{ result_count: number; items: TandfItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildTandfFilterUrl(args);
  const profile = args.profile || "research-tandf";
  const tabId = args.tab_id || `research-tandf-filter-${Date.now()}`;
  const page = await withAllocatedTandfPage(profile, refined_url, tabId, args.cdp_port, (p) => readTandfPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchTandfExport(args: TandfExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: TandfExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-tandf";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "tandf"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const citationUrl = buildTandfCitationUrl(doi);
  const tabId = args.tab_id || `research-tandf-export-${Date.now()}`;
  return await withAllocatedTandfPage(profile, citationUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 5; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        const formCount = await page.locator('form[name="frmCitmgr"]').count().catch(() => 0);
        if (/Download Citation/i.test(text) && /Choose format/i.test(text) && formCount) break;
        await sleep(3000);
      }
      const radio = `#${format}`;
      const count = await page.locator(radio).count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Taylor & Francis citation format radio was not found", { selector: radio });
      const direct = page.locator("#direct");
      if (await direct.count().catch(() => 0)) {
        const directChecked = await direct.isChecked().catch(() => false);
        if (directChecked) await direct.click({ timeout: 3000 }).catch(() => undefined);
      }
      await page.locator(radio).click({ timeout: 10000 });
      const checked = await page.locator(radio).isChecked().catch(() => false);
      if (!checked) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Taylor & Francis citation format radio did not become checked", { selector: radio });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "showCitFormats",
        buttonSelector: "span.formbutton",
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 60000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Taylor & Francis RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !/@\w+\s*\{/m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Taylor & Francis BibTeX artifact failed content validation", { artifact_path, doi });
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
      throw new WebAiToolError(code, "Taylor & Francis export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
