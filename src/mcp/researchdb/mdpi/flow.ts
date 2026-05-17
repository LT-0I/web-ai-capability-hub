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

export type MdpiArticleType = "research-article" | "review-article" | "rapid-communication" | "editorial" | string;
export type MdpiView = "default" | "abstract" | "compact" | string;
export type MdpiExportFormat = "bibtex" | "endnote" | "ris";

export interface MdpiItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; article_path: string; article_id: string; }
export interface MdpiSearchArgs { query: string; journal?: string; article_type?: MdpiArticleType; year_from?: number; year_to?: number; view?: MdpiView; sort?: string; page_count?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface MdpiFilterArgs extends MdpiSearchArgs { country?: string; subject?: string; }
export interface MdpiExportArgs { article_url?: string; article_path?: string; doi?: string; format?: MdpiExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const MDPI_ORIGIN = "https://www.mdpi.com";
const VALID_FORMATS = new Set(["bibtex", "endnote", "ris"]);
const FORMAT_SELECTOR: Record<MdpiExportFormat, string> = {
  bibtex: "#cite-modal a:nth-of-type(1)",
  endnote: "#cite-modal a:nth-of-type(2)",
  ris: "#cite-modal a:nth-of-type(3)"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): MdpiExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported MDPI export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as MdpiExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function cleanText(value: string): string {
  return (value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.3390\/[A-Za-z0-9._-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function attr(block: string, name: string): string { return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(block)?.[1] || ""; }
function authorsFromText(text: string): string[] {
  const match = /\bby\s+(.+?)(?:\s+(?:[A-Z][A-Za-z &-]+)\s+20\d{2}|\s+\d+\s+pages|\s+Open Access|$)/i.exec(text);
  const raw = match?.[1] || "";
  return raw.split(/,|\band\b/i).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
function journalFromText(text: string): string {
  const matches = [...String(text || "").matchAll(/\b([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,3})\s+(?:19\d{2}|20\d{2}),\s*\d+/g)];
  const raw = (matches[matches.length - 1]?.[1] || "").trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 2) return words.slice(-2).join(" ");
  return raw;
}
function journalFromBlock(block: string, text: string): string {
  const matches = [...String(block || "").matchAll(/<[^>]+>\s*([A-Z][A-Za-z &-]+)\s+(?:19\d{2}|20\d{2}),\s*\d+/g)];
  const fromHtml = cleanText(matches[matches.length - 1]?.[1] || "");
  return fromHtml || journalFromText(text);
}

export function buildMdpiSearchUrl(args: MdpiSearchArgs): string {
  const url = new URL("/search", MDPI_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  if (args.journal) url.searchParams.set("journal", args.journal);
  if (args.article_type) url.searchParams.set("article_type", String(args.article_type));
  const yearFrom = asPositiveInt(args.year_from, "year_from");
  const yearTo = asPositiveInt(args.year_to, "year_to");
  if (yearFrom) url.searchParams.set("year_from", String(yearFrom));
  if (yearTo) url.searchParams.set("year_to", String(yearTo));
  url.searchParams.set("view", args.view || "default");
  if (args.sort) url.searchParams.set("sort", args.sort);
  const pageCount = asPositiveInt(args.page_count, "page_count");
  if (pageCount) url.searchParams.set("page_count", String(pageCount));
  return url.toString();
}

export function buildMdpiFilterUrl(args: MdpiFilterArgs): string {
  const url = new URL(buildMdpiSearchUrl(args));
  if (args.country) url.searchParams.set("countries", args.country);
  if (args.subject) url.searchParams.set("subjects", args.subject);
  return url.toString();
}

export function buildMdpiArticleUrl(args: MdpiExportArgs): string {
  const raw = args.article_url || args.article_path;
  if (!raw || !raw.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "article_url or article_path is required for MDPI export");
  const url = new URL(raw, MDPI_ORIGIN);
  if (url.hostname !== "www.mdpi.com" && url.hostname !== "mdpi.com") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "MDPI export URL must be on www.mdpi.com", { article_url: raw });
  url.hash = "";
  return url.toString();
}

export function parseMdpiResultCount(text: string): number {
  const raw = /Search Results\s*\(([\d,]+)\)/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "MDPI result count node was not found", { probe: "Search Results (N)" });
  return Number(raw.replace(/,/g, ""));
}

export function parseMdpiItemsFromHtml(html: string): MdpiItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<[^>]+class=["'][^"']*generic-item[^"']*article-item[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*generic-item[^"']*article-item|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const titleMatch = /<a[^>]+class=["'][^"']*title-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const titleAnchor = titleMatch?.[0] || "";
    const title = cleanText(titleMatch?.[1] || "") || cleanText(block).slice(0, 180);
    const article_path = attr(titleAnchor, "href");
    const checkbox = /<input[^>]+name=["']articles_ids\[\]["'][^>]*>/i.exec(block)?.[0] || "";
    const article_id = attr(checkbox, "value");
    const text = cleanText(block);
    return { title, authors: authorsFromText(text), doi: doiFromText(text), journal: journalFromBlock(block, text), year: yearFromText(text), article_path, article_id };
  }).filter((item) => item.title || item.article_path || item.article_id).slice(0, 100);
}

export function parseMdpiItemsFromVisibleText(text: string): MdpiItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Search Results \([\d,]+\)/i).pop() || normalized;
  const pieces = tail.split(/\s+Open AccessArticle\s+/).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const year = yearFromText(beforeDoi);
    const title = beforeDoi.split(/\s+by\s+/i)[0].trim();
    return { title, authors: authorsFromText(beforeDoi), doi, journal: journalFromText(beforeDoi), year, article_path: "", article_id: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readMdpiPage(page: any, expectedUrl: string): Promise<{ visibleText: string; title: string; html: string; resultCount: number; itemCount: number; items: MdpiItem[]; url: string }> {
  const expectedSearch = new URL(expectedUrl).search;
  let lastItemCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const url = await page.url?.();
      const state = await page.evaluate?.(() => ({
        readyState: document.readyState,
        search: location.search,
        itemCount: document.querySelectorAll(".generic-item.article-item").length
      })).catch(() => ({ readyState: "unknown", search: "", itemCount: 0 }));
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseMdpiResultCount(visibleText);
      const items = parseMdpiItemsFromHtml(html);
      if (state.search !== expectedSearch) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "MDPI results page location.search did not match requested query", { expectedSearch, observedSearch: state.search, url });
      stable = { visibleText, title, html, resultCount, itemCount: Number(state.itemCount) || items.length, items: items.length ? items : parseMdpiItemsFromVisibleText(visibleText), url };
      if (stable.itemCount >= 1 && stable.itemCount === lastItemCount) break;
      lastItemCount = stable.itemCount;
    } catch (error) { lastError = error; }
    await sleep(2500);
  }
  if (!stable || stable.itemCount < 1) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "MDPI results page did not hydrate article items", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedMdpiPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "MDPI tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchMdpiSearch(args: MdpiSearchArgs): Promise<{ result_count: number; item_count: number; items: MdpiItem[]; query_url: string }> {
  const query_url = buildMdpiSearchUrl(args);
  const profile = args.profile || "research-mdpi";
  const tabId = args.tab_id || `research-mdpi-search-${Date.now()}`;
  const page = await withAllocatedMdpiPage(profile, query_url, tabId, args.cdp_port, (p) => readMdpiPage(p, query_url));
  return { result_count: page.resultCount, item_count: page.itemCount, items: page.items, query_url };
}

export async function researchMdpiFilter(args: MdpiFilterArgs): Promise<{ result_count: number; item_count: number; items: MdpiItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildMdpiFilterUrl(args);
  const profile = args.profile || "research-mdpi";
  const tabId = args.tab_id || `research-mdpi-filter-${Date.now()}`;
  const page = await withAllocatedMdpiPage(profile, refined_url, tabId, args.cdp_port, (p) => readMdpiPage(p, refined_url));
  return { result_count: page.resultCount, item_count: page.itemCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchMdpiExport(args: MdpiExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: MdpiExportFormat; article_url: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-mdpi";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "mdpi"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const article_url = buildMdpiArticleUrl(args);
  const tabId = args.tab_id || `research-mdpi-export-${Date.now()}`;
  return await withAllocatedMdpiPage(profile, article_url, tabId, args.cdp_port, async (page) => {
    try {
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      const count = await page.locator('a[data-reveal-id="cite-modal"]').count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "MDPI Cite modal trigger was not found", { selector: 'a[data-reveal-id="cite-modal"]', article_url });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: new URL(article_url).pathname,
        buttonSelector: 'a[data-reveal-id="cite-modal"]',
        followUpSelector: FORMAT_SELECTOR[format],
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        viewportWidth: 1280,
        viewportHeight: 2400,
        prerenderWaitMs: 2500,
        filenamePattern: format === "bibtex" ? "*.bib" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      const hasExpectedDoi = !args.doi || text.includes(args.doi);
      const valid = format === "bibtex" ? /@Article\{/i.test(text) && /DOI\s*=\s*\{10\.3390\//i.test(text) : text.trim().length > 0;
      if (!valid || !hasExpectedDoi) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "MDPI citation artifact failed content validation", { artifact_path, format, doi: args.doi });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, article_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "MDPI export failed", { article_url, format, cause: error?.message || String(error) });
    }
  });
}
