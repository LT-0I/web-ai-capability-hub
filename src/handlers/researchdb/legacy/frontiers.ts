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

export type FrontiersFacetGroup = "domains" | "journals" | "sections" | "type" | "date" | "partofresearchtopic" | "sort";
export type FrontiersExportFormat = "bibtex" | "endnote" | "reference";

export interface FrontiersItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; url: string; }
export interface FrontiersSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface FrontiersFilterArgs extends FrontiersSearchArgs { group: FrontiersFacetGroup | string; option_id: string | number; option_label?: string; }
export interface FrontiersExportArgs { doi: string; journal_slug?: string; article_url?: string; format?: FrontiersExportFormat | string; filename?: string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const FRONTIERS_ORIGIN = "https://www.frontiersin.org";
const FRONTIERS_PUBLIC_ORIGIN = "https://public-pages-files-2025.frontiersin.org";
const COUNT_SELECTOR = "#article-results .results-header .title span";
const RESULT_ITEM_SELECTOR = "#article-results ul.entities-list.articles > li";
const VALID_GROUPS = new Set(["domains", "journals", "sections", "type", "date", "partofresearchtopic", "sort"]);
const VALID_FORMATS = new Set(["bibtex", "endnote", "reference"]);
const FORMAT_PATH: Record<FrontiersExportFormat, string> = { bibtex: "bibTex", endnote: "endNote", reference: "reference" };
const FORMAT_EXT: Record<FrontiersExportFormat, string> = { bibtex: "bib", endnote: "enw", reference: "ris" };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "frontiers"; }
function uniquePath(dir: string, filename: string): string {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}(${index})${parsed.ext}`);
    index += 1;
  }
  return candidate;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeGroup(group: string): FrontiersFacetGroup {
  const out = String(group || "").trim().toLowerCase();
  if (!VALID_GROUPS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Frontiers facet group: ${group}`, { group, valid: [...VALID_GROUPS] });
  return out as FrontiersFacetGroup;
}
function normalizeOptionId(optionId: string | number): string {
  if (optionId === undefined || optionId === null || String(optionId).trim() === "") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "option_id is required");
  return String(optionId).replace(/^_/, "").trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}
function normalizeFormat(format?: string): FrontiersExportFormat {
  const raw = (format || "bibtex").toLowerCase();
  const out = raw === "bib" || raw === "bibtex" ? "bibtex" : raw === "ris" ? "reference" : raw;
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Frontiers export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as FrontiersExportFormat;
}
function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.3389\/[A-Za-z]+\.\d{4}\.\d+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  return String(text || "").split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(Frontiers|Article|Original Research|Review|Brief Research Report)$/i.test(s)).slice(0, 12);
}
function parseSlugFromArticleUrl(articleUrl?: string): string | undefined {
  if (!articleUrl) return undefined;
  const match = /\/journals\/([^/]+)\/articles\/10\.3389\//i.exec(articleUrl);
  return match?.[1];
}
function filenameForExport(doi: string, format: FrontiersExportFormat, filename?: string): string {
  return filename || `frontiers-${safeFileToken(doi)}.${FORMAT_EXT[format]}`;
}

export function buildFrontiersSearchUrl(args: FrontiersSearchArgs): string {
  const url = new URL("/search", FRONTIERS_ORIGIN);
  url.searchParams.set("query", requireQuery(args.query));
  url.searchParams.set("tab", "articles");
  return url.toString();
}

export function frontiersFacetSelectors(group: string, optionId: string | number): { group: FrontiersFacetGroup; groupSelector: string; optionSelector: string } {
  const normalizedGroup = normalizeGroup(group);
  const normalizedOption = normalizeOptionId(optionId);
  return {
    group: normalizedGroup,
    groupSelector: `[data-test-id="article_filter_${normalizedGroup}"]`,
    optionSelector: `[data-test-id="article_${normalizedGroup}_filter_${normalizedOption}"]`
  };
}

export function buildFrontiersCitationUrl(args: Pick<FrontiersExportArgs, "doi" | "journal_slug" | "article_url" | "format">): string {
  const doi = requireDoi(args.doi);
  const journalSlug = args.journal_slug || parseSlugFromArticleUrl(args.article_url);
  if (!journalSlug) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "journal_slug or canonical article_url is required for Frontiers citation export", { doi });
  const format = normalizeFormat(args.format);
  return new URL(`/journals/${journalSlug}/articles/${doi}/${FORMAT_PATH[format]}`, FRONTIERS_PUBLIC_ORIGIN).toString();
}

export function parseFrontiersResultCount(text: string): number {
  const raw = /([\d,]+)\s*Articles?/i.exec(text || "")?.[1] || /^\s*([\d,]+)\s*$/.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers result count node was not found", { probe: COUNT_SELECTOR });
  return Number(raw.replace(/,/g, ""));
}

export function parseFrontiersItemsFromHtml(html: string): FrontiersItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<li[^>]*>([\s\S]*?<a[^>]+data-test-id=["']article_navigate_[^"']+["'][\s\S]*?)(?=<li[^>]*>|<\/ul>|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const href = /<a[^>]+data-test-id=["']article_navigate_[^"']+["'][^>]+href=["']([^"']+)["']/i.exec(block)?.[1]
      || /<a[^>]+href=["']([^"']*\/journals\/[^"']+\/articles\/10\.3389\/[^"']+)["']/i.exec(block)?.[1]
      || "";
    const url = href ? new URL(href, FRONTIERS_ORIGIN).toString() : "";
    const doi = doiFromText(decodeURIComponent(url)) || doiFromText(cleanText(block));
    const title = cleanText(/<a[^>]+data-test-id=["']article_navigate_[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<h\d[^>]*>([\s\S]*?)<\/h\d>/i.exec(block)?.[1] || "")
      || cleanText(block).split(/\s+(?:Original Research|Review|Brief Research Report|Front\.)\b/i)[0].trim().slice(0, 260);
    const text = cleanText(block).replace(title, "");
    const journal = (/\bFrontiers in [A-Za-z &-]+/i.exec(text)?.[0] || "").trim();
    return { title, authors: authorsFromText(text.split(/\b(?:Original Research|Review|Frontiers in|DOI|Published)\b/i)[0] || ""), doi, journal, year: yearFromText(text), url };
  }).filter((item) => item.title || item.doi || item.url).slice(0, 100);
}

export function parseFrontiersItemsFromVisibleText(text: string): FrontiersItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const chunks = normalized.split(/(?=Original Research|Review|Brief Research Report|Systematic Review)/i).slice(1);
  return chunks.map((chunk) => {
    const doi = doiFromText(chunk);
    const year = yearFromText(chunk);
    const title = chunk.replace(/^(?:Original Research|Review|Brief Research Report|Systematic Review)\s+/i, "").split(/\s+(?:Frontiers in|doi:|DOI|Published)\b/i)[0].trim().slice(0, 260);
    const journal = (/\bFrontiers in [A-Za-z &-]+/i.exec(chunk)?.[0] || "").trim();
    return { title, authors: [], doi, journal, year, url: doi ? `${FRONTIERS_ORIGIN}/articles/${doi}` : "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readFrontiersResultsPage(page: any, previousCount?: number): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: FrontiersItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 7; i++) {
    try {
      const countText = await page.locator(COUNT_SELECTOR).innerText({ timeout: 2500 });
      const resultCount = parseFrontiersResultCount(countText);
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const items = parseFrontiersItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseFrontiersItemsFromVisibleText(visibleText) };
      if (previousCount === undefined || resultCount !== previousCount) break;
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers results page did not hydrate", { selector: COUNT_SELECTOR, cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedFrontiersPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Frontiers tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchFrontiersSearch(args: FrontiersSearchArgs): Promise<{ result_count: number; items: FrontiersItem[]; query_url: string }> {
  const query_url = buildFrontiersSearchUrl(args);
  const profile = args.profile || "research-frontiers";
  const tabId = args.tab_id || `research-frontiers-search-${Date.now()}`;
  const page = await withAllocatedFrontiersPage(profile, query_url, tabId, args.cdp_port, (p) => readFrontiersResultsPage(p));
  const limit = args.page_size && args.page_size > 0 ? args.page_size : undefined;
  return { result_count: page.resultCount, items: limit ? page.items.slice(0, limit) : page.items, query_url };
}

export async function researchFrontiersFilter(args: FrontiersFilterArgs): Promise<{ result_count: number; items: FrontiersItem[]; query_url: string; group: FrontiersFacetGroup; selected_label: string }> {
  const query_url = buildFrontiersSearchUrl(args);
  const profile = args.profile || "research-frontiers";
  const tabId = args.tab_id || `research-frontiers-filter-${Date.now()}`;
  const selectors = frontiersFacetSelectors(args.group, args.option_id);
  return await withAllocatedFrontiersPage(profile, query_url, tabId, args.cdp_port, async (page) => {
    const base = await readFrontiersResultsPage(page);
    const groupLocator = page.locator(selectors.groupSelector).first();
    if (!(await groupLocator.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers facet group was not found", selectors);
    await groupLocator.click({ timeout: 10000 });
    const optionLocator = page.locator(selectors.optionSelector).first();
    if (!(await optionLocator.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers facet option was not found", selectors);
    await optionLocator.click({ timeout: 10000 });
    const refined = await readFrontiersResultsPage(page, base.resultCount);
    if (refined.resultCount === base.resultCount) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers facet refine did not produce the required count-span delta", { group: selectors.group, option_id: args.option_id, count: refined.resultCount });
    }
    const selected = await page.locator(`#article-results li.current[data-test-id^="article_${selectors.group}_filter_"]`).first().innerText({ timeout: 5000 }).catch(() => "");
    const selectedLabel = selected.replace(/\s+/g, " ").trim();
    if (args.option_label && !selectedLabel.toLowerCase().includes(args.option_label.toLowerCase())) {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Frontiers facet active option did not match requested label", { expected: args.option_label, actual: selectedLabel });
    }
    const limit = args.page_size && args.page_size > 0 ? args.page_size : undefined;
    return { result_count: refined.resultCount, items: limit ? refined.items.slice(0, limit) : refined.items, query_url, group: selectors.group, selected_label: selectedLabel };
  });
}

export async function researchFrontiersExport(args: FrontiersExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: FrontiersExportFormat; doi: string; source_url: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-frontiers";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "frontiers"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const source_url = buildFrontiersCitationUrl({ doi, journal_slug: args.journal_slug, article_url: args.article_url, format });
  const tabId = args.tab_id || `research-frontiers-export-${Date.now()}`;
  return await withAllocatedFrontiersPage(profile, FRONTIERS_ORIGIN, tabId, args.cdp_port, async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Frontiers citation download returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, filenameForExport(doi, format, args.filename));
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      const valid = format === "bibtex"
        ? /^@ARTICLE\{/m.test(text) && text.includes(doi)
        : format === "reference"
          ? /^TY\s+-/m.test(text) && text.includes(doi)
          : text.includes(doi) && /%[0A-Z]/m.test(text);
      if (!valid) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Frontiers citation artifact failed content validation", { artifact_path, doi, format });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "Frontiers export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
