const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type SpringerExportFormat = "ris" | "csv";

export interface SpringerItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; url: string; }
export interface SpringerSearchArgs { query: string; title?: string; contributor?: string; journal?: string; date_from?: number; date_to?: number; date?: string; page?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface SpringerFilterArgs extends SpringerSearchArgs { content_type?: string; open_access?: string; language?: string; taxonomy?: string; discipline?: string; sub_discipline?: string; sustainable_development_goal?: string; }
export interface SpringerExportArgs { doi?: string; format?: SpringerExportFormat | string; bulk_export?: boolean; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SPRINGER_ORIGIN = "https://link.springer.com";
const SPRINGER_CITATION_ORIGIN = "https://citation-needed.springer.com";
const VALID_FORMATS = new Set(["ris", "csv"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi?: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required for Springer per-article RIS export", { doi });
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}
function normalizeFormat(format?: string): SpringerExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Springer export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as SpringerExportFormat;
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
function doiFromText(text: string): string { return (/10\.[0-9]{4,9}\/[A-Za-z0-9.\-_;()/:]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const cleaned = text.replace(/\b(?:Abstract|Download citation|Download references|Published|Article|Chapter|Conference Paper|Open Access)\b.*$/i, "");
  return cleaned.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(Springer|Nature|Link|Article|Chapter)$/i.test(s)).slice(0, 12);
}
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "springer"; }
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
function addOptional(url: URL, key: string, value: unknown): void {
  if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
}

export function buildSpringerSearchUrl(args: SpringerSearchArgs): string {
  const url = new URL("/search", SPRINGER_ORIGIN);
  url.searchParams.set("query", requireQuery(args.query));
  addOptional(url, "title", args.title);
  addOptional(url, "contributor", args.contributor);
  addOptional(url, "journal", args.journal);
  const dateFrom = asPositiveInt(args.date_from, "date_from");
  const dateTo = asPositiveInt(args.date_to, "date_to");
  if (dateFrom) url.searchParams.set("dateFrom", String(dateFrom));
  if (dateTo) url.searchParams.set("dateTo", String(dateTo));
  if (dateFrom || dateTo || args.date) url.searchParams.set("date", args.date || "custom");
  const page = asPositiveInt(args.page, "page");
  if (page) url.searchParams.set("page", String(page));
  return url.toString();
}

export function buildSpringerFilterUrl(args: SpringerFilterArgs): string {
  const url = new URL(buildSpringerSearchUrl(args));
  addOptional(url, "content-type", args.content_type);
  addOptional(url, "openAccess", args.open_access);
  addOptional(url, "language", args.language);
  addOptional(url, "taxonomy", args.taxonomy);
  addOptional(url, "facet-discipline", args.discipline);
  addOptional(url, "facet-sub-discipline", args.sub_discipline);
  addOptional(url, "sustainableDevelopmentGoal", args.sustainable_development_goal);
  return url.toString();
}

export function buildSpringerCitationUrl(doi: string): string {
  const url = new URL(`/v2/references/${requireDoi(doi)}`, SPRINGER_CITATION_ORIGIN);
  url.searchParams.set("format", "refman");
  url.searchParams.set("flavour", "citation");
  return url.toString();
}

export function parseSpringerResultCount(text: string): number {
  const raw = /Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+results/i.exec(text || "")?.[1]
    || /of\s+([\d,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Springer result count node was not found", { probe: 'span[data-test="results-data-total"]' });
  return Number(raw.replace(/,/g, ""));
}

export function parseSpringerItemsFromHtml(html: string): SpringerItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<li[^>]+data-test=["']search-result-item["'][^>]*>([\s\S]*?)(?=<li[^>]+data-test=["']search-result-item["']|<\/ol>|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const href = /<a[^>]+href=["']([^"']*(?:\/article\/|\/chapter\/)[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const url = href ? new URL(href, SPRINGER_ORIGIN).toString() : "";
    const doi = doiFromText(decodeURIComponent(url)) || doiFromText(text);
    const title = cleanText(/<(?:h\d|a)[^>]*(?:data-test=["']title["']|class=["'][^"']*(?:title|app-card-open__link)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Article|Chapter|Conference Paper|Download citation|Open Access)\b/i)[0].trim().slice(0, 260);
    const publication = (/\b(?:Journal|Book|Published in):\s*(.*?)(?:\s+Published|\s+Article|\s+Chapter|$)/i.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\b(?:Journal|Book|Published in|Download citation|https?:\/\/doi\.org)\b/i)[0] || "";
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text), url };
  }).filter((item) => item.title || item.doi || item.url).slice(0, 100);
}

export function parseSpringerItemsFromVisibleText(text: string): SpringerItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const chunks = normalized.split(/\b(?:Article|Chapter|Conference Paper)\b/).slice(1);
  return chunks.map((chunk) => {
    const doi = doiFromText(chunk);
    const year = yearFromText(chunk);
    const beforeDoi = doi ? chunk.split(doi)[0] : chunk;
    const title = beforeDoi.replace(/^\s*(?:Open Access\s*)?/, "").split(/\s+(?:Download citation|Authors?|Published|Journal)\b/i)[0].trim().slice(0, 260);
    return { title, authors: authorsFromText(beforeDoi.slice(title.length)), doi, publication: "", year, url: doi ? new URL(`/article/${doi}`, SPRINGER_ORIGIN).toString() : "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readSpringerResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: SpringerItem[]; appliedFilters: string[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 30; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseSpringerResultCount(visibleText);
      const itemCount = await page.locator('li[data-test="search-result-item"]').count().catch(() => 0);
      const items = parseSpringerItemsFromHtml(html);
      const appliedFilters = await page.locator('a[data-test="applied-filter"]').allInnerTexts().catch(() => []);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseSpringerItemsFromVisibleText(visibleText), appliedFilters };
      if (itemCount > 0 && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(500);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Springer results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedSpringerPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Springer tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchSpringerSearch(args: SpringerSearchArgs): Promise<{ result_count: number; items: SpringerItem[]; query_url: string }> {
  const query_url = buildSpringerSearchUrl(args);
  const profile = args.profile || "nuaa-springer";
  const tabId = args.tab_id || `research-springer-search-${Date.now()}`;
  const page = await withAllocatedSpringerPage(profile, query_url, tabId, args.cdp_port, (p) => readSpringerResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchSpringerFilter(args: SpringerFilterArgs): Promise<{ result_count: number; items: SpringerItem[]; refined_url: string; confirm_url: string; confirm_title: string; applied_filters: string[] }> {
  const refined_url = buildSpringerFilterUrl(args);
  const profile = args.profile || "nuaa-springer";
  const tabId = args.tab_id || `research-springer-filter-${Date.now()}`;
  const page = await withAllocatedSpringerPage(profile, refined_url, tabId, args.cdp_port, (p) => readSpringerResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title, applied_filters: page.appliedFilters };
}

export async function researchSpringerExport(args: SpringerExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: "ris"; doi: string; source_url: string }> {
  const format = normalizeFormat(args.format);
  if (args.bulk_export || format === "csv") {
    throw new WebAiToolError(ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, "SpringerLink bulk CSV export is behind a personal-account login wall; per-article RIS is the verified export primitive", { format, blocker: "Springer Nature account login required for /search/csv" });
  }
  const doi = requireDoi(args.doi);
  const profile = args.profile || "nuaa-springer";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "springer"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const source_url = buildSpringerCitationUrl(doi);
  const tabId = args.tab_id || `research-springer-export-${Date.now()}`;
  return await withAllocatedSpringerPage(profile, SPRINGER_ORIGIN, tabId, args.cdp_port, async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Springer RIS download returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, `springer-${safeFileToken(doi)}.ris`);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Springer RIS artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format: "ris", doi, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "Springer export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
