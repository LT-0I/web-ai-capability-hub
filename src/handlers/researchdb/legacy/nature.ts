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

export type NatureArticleType = "research" | "reviews";
export type NatureExportFormat = "ris";
export type NatureFacetParam = "article_type" | "journal" | "subject" | "date_range";

export interface NatureItem { title: string; authors: string[]; doi: string; article_url: string; journal: string; year: number | null; article_type: string; }
export interface NatureSearchArgs { query: string; start_year?: number; end_year?: number; order?: string; profile?: string; cdp_port?: number; tab_id?: string; }
export interface NatureFilterArgs extends NatureSearchArgs { article_type?: NatureArticleType | string; journal?: string; subject?: string; date_range?: string; facet_param?: NatureFacetParam | string; facet_value?: string; }
export interface NatureExportArgs { doi: string; format?: NatureExportFormat | string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const NATURE_ORIGIN = "https://www.nature.com";
const VALID_ARTICLE_TYPES = new Set(["research", "reviews"]);
const VALID_FACET_PARAMS = new Set(["article_type", "journal", "subject", "date_range"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  const out = doi.trim();
  if (!/^10\.1038\//i.test(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Nature DOI must start with 10.1038/", { doi });
  return out;
}
function asYear(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1845 || n > 2100) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a valid Nature year`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): NatureExportFormat {
  const out = (format || "ris").toLowerCase();
  if (out !== "ris") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Nature export format: ${format}`, { format, valid: ["ris"] });
  return "ris";
}
function setIfPresent(url: URL, key: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) url.searchParams.set(key, value.trim());
}

export function buildNatureSearchUrl(args: NatureSearchArgs): string {
  const url = new URL("/search", NATURE_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("order", args.order || "relevance");
  const start = asYear(args.start_year, "start_year");
  const end = asYear(args.end_year, "end_year");
  if (start || end) {
    if (!start || !end) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Nature date_range requires both start_year and end_year", { start_year: args.start_year, end_year: args.end_year });
    if (start > end) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "start_year must be <= end_year", { start_year: start, end_year: end });
    url.searchParams.set("date_range", `${start}-${end}`);
  }
  return url.toString();
}

function facetFromArgs(args: NatureFilterArgs): { param: string; value: string } | undefined {
  if (args.facet_param || args.facet_value) {
    const param = String(args.facet_param || "").trim();
    const value = String(args.facet_value || "").trim();
    if (!VALID_FACET_PARAMS.has(param)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Unsupported Nature facet_param", { facet_param: args.facet_param, valid: [...VALID_FACET_PARAMS] });
    if (!value) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "facet_value is required when facet_param is provided", { facet_param: args.facet_param });
    return { param, value };
  }
  if (args.article_type) {
    const value = String(args.article_type).trim();
    if (!VALID_ARTICLE_TYPES.has(value)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Unsupported Nature article_type", { article_type: args.article_type, valid: [...VALID_ARTICLE_TYPES] });
    return { param: "article_type", value };
  }
  if (args.journal) return { param: "journal", value: args.journal.trim() };
  if (args.subject) return { param: "subject", value: args.subject.trim() };
  if (args.date_range) return { param: "date_range", value: args.date_range.trim() };
  return undefined;
}

export function natureFacetParam(args: NatureFilterArgs): string | undefined { return facetFromArgs(args)?.param; }

export function buildNatureFilterUrl(args: NatureFilterArgs): string {
  const url = new URL(buildNatureSearchUrl(args));
  const facet = facetFromArgs(args);
  if (facet) url.searchParams.set(facet.param, facet.value);
  return url.toString();
}

export function buildNatureArticleUrl(doi: string): string {
  const suffix = requireDoi(doi).replace(/^10\.1038\//i, "");
  return new URL(`/articles/${encodeURIComponent(suffix)}`, NATURE_ORIGIN).toString();
}

export function buildNatureCitationUrl(doi: string): string {
  const encodedDoi = encodeURIComponent(requireDoi(doi));
  return `https://citation-needed.springer.com/v2/references/${encodedDoi}?format=refman&flavour=citation`;
}

export function parseNatureResultCount(text: string): number {
  const raw = /([\d,]+)\s+results?/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Nature result count node was not found", { probe: "N results" });
  return Number(raw.replace(/,/g, ""));
}

function decodeEntities(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeEntities(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(18\d{2}|19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromArticleHref(href: string): string {
  const article = /\/articles\/([^"'?#\s]+)/i.exec(href || "")?.[1] || "";
  return article ? `10.1038/${decodeURIComponent(article)}` : "";
}
function authorsFromText(text: string): string[] {
  const beforeDate = (text || "").split(/\b(?:Published|Article|Review Article|Scientific Reports|Nature Communications|Nature)\b|\b(?:18\d{2}|19\d{2}|20\d{2})\b/i)[0] || "";
  return beforeDate.split(/,| and |;/).map((s) => s.trim()).filter((s) => s && !/^(Open Access|Article|Review Article|Research Highlight|News)$/i.test(s)).slice(0, 12);
}

export function parseNatureItemsFromHtml(html: string): NatureItem[] {
  const source = String(html || "");
  const anchors = [...source.matchAll(/<a\b[^>]*href=["'](\/articles\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  const items: NatureItem[] = [];
  for (const match of anchors) {
    const href = match[1];
    const title = cleanText(match[2]);
    if (!title || seen.has(href) || /^(View author publications|Download PDF|Download citation)$/i.test(title)) continue;
    seen.add(href);
    const idx = source.indexOf(match[0]);
    const block = source.slice(Math.max(0, idx - 1000), Math.min(source.length, idx + 2200));
    const text = cleanText(block).replace(title, "");
    const article_type = /\b(Research|Reviews?|Review Article|Article|News|Brief Communication)\b/i.exec(text)?.[1] || "";
    const journal = /\b(Scientific Reports|Nature Communications|Nature|Nature [A-Z][A-Za-z &-]+)\b/.exec(text)?.[1] || "";
    items.push({ title, authors: authorsFromText(text), doi: doiFromArticleHref(href), article_url: new URL(href, NATURE_ORIGIN).toString(), journal, year: yearFromText(text), article_type });
    if (items.length >= 100) break;
  }
  return items;
}

export function parseNatureItemsFromVisibleText(text: string): NatureItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Sort by Relevance|results?/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=(?:Review Article|(?<!Review\s)Article|Research Highlight|News)\s+)/i).slice(1);
  return pieces.map((piece) => {
    const article_type = /^(Review Article|Article|Research Highlight|News|Reviews?)/i.exec(piece)?.[1] || "";
    const clean = piece.replace(article_type, "").trim();
    const year = yearFromText(clean);
    const title = clean.split(/\s+(?:Scientific Reports|Nature Communications|Nature(?:\s[A-Z][A-Za-z &-]+)?|Published:|\b(?:18\d{2}|19\d{2}|20\d{2})\b)/)[0].trim();
    const rest = clean.slice(title.length).trim();
    const journal = /\b(Scientific Reports|Nature Communications|Nature|Nature [A-Z][A-Za-z &-]+)\b/.exec(rest)?.[1] || "";
    return { title, authors: authorsFromText(rest), doi: "", article_url: "", journal, year, article_type };
  }).filter((item) => item.title).slice(0, 100);
}

async function readNaturePage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: NatureItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      await page.locator('[data-test="search-results-title"], body').first().waitFor({ timeout: 12000 }).catch(() => undefined);
      const visibleText = await page.locator("body").innerText({ timeout: 12000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseNatureResultCount(visibleText);
      const items = parseNatureItemsFromHtml(html);
      stable = { visibleText, title, html, url: page.url?.() || "", resultCount, items: items.length ? items : parseNatureItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Nature results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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
    await page.locator('button.cc-banner__button-reject').click({ timeout: 3000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || url, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedNaturePage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Nature tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchNatureSearch(args: NatureSearchArgs): Promise<{ result_count: number; items: NatureItem[]; query_url: string }> {
  const query_url = buildNatureSearchUrl(args);
  const profile = args.profile || "research-nature";
  const tabId = args.tab_id || `research-nature-search-${Date.now()}`;
  const page = await withAllocatedNaturePage(profile, query_url, tabId, args.cdp_port || 9248, (p) => readNaturePage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchNatureFilter(args: NatureFilterArgs): Promise<{ result_count: number; items: NatureItem[]; refined_url: string; confirm_title: string; facet_param?: string; facet_value?: string; facet_checked?: boolean }> {
  const refined_url = buildNatureFilterUrl(args);
  const profile = args.profile || "research-nature";
  const tabId = args.tab_id || `research-nature-filter-${Date.now()}`;
  const facet = facetFromArgs(args);
  const page = await withAllocatedNaturePage(profile, refined_url, tabId, args.cdp_port || 9248, async (p) => {
    const read = await readNaturePage(p);
    const facet_checked = facet?.param === "article_type" ? await p.locator(`#article-type-${facet.value}`).evaluate((el: any) => el.checked === true).catch(() => false) : undefined;
    return { ...read, facet_checked };
  });
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title, facet_param: facet?.param, facet_value: facet?.value, facet_checked: page.facet_checked };
}

export async function researchNatureExport(args: NatureExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: NatureExportFormat; doi: string; article_url: string; citation_url: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const article_url = buildNatureArticleUrl(doi);
  const citation_url = buildNatureCitationUrl(doi);
  const profile = args.profile || "research-nature";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "nature"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-nature-export-${Date.now()}`;
  return await withAllocatedNaturePage(profile, article_url, tabId, args.cdp_port || 9248, async (page) => {
    try {
      await page.locator('a[data-test="citation-link"]').first().waitFor({ timeout: 20000 });
      const href = await page.locator('a[data-test="citation-link"]').first().getAttribute("href").catch(() => "");
      if (!href || !href.includes("citation-needed.springer.com") || !href.includes("format=refman")) {
        throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Nature citation link was not found", { selector: 'a[data-test="citation-link"]', href });
      }
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "nature.com/articles",
        buttonSelector: 'a[data-test="citation-link"]',
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        filenamePattern: "*.ris"
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^TY  - JOUR/m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Nature RIS artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, article_url, citation_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.ELEMENT_NOT_FOUND;
      throw new WebAiToolError(code, "Nature export failed", { doi, article_url, citation_url, cause: error?.message || String(error) });
    }
  });
}
