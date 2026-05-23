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

export type Scoap3ExportFormat = "csv" | "json";
export type Scoap3CountryLogic = "AND" | "OR";

export interface Scoap3Item { id: string; title: string; doi: string; arxiv_id: string; journal: string; publication_date: string; url: string; }
export interface Scoap3SearchArgs { query: string; page?: number; size?: number; sort?: string; profile?: string; cdp_port?: number; tab_id?: string; }
export interface Scoap3FilterArgs extends Scoap3SearchArgs { journal?: string | string[]; country?: string | string[]; country_logic?: Scoap3CountryLogic | string; publication_year_gte?: number | string; publication_year_lte?: number | string; }
export interface Scoap3ExportArgs extends Scoap3FilterArgs { record_id?: string | number; format?: Scoap3ExportFormat | string; filename?: string; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SCOAP3_ORIGIN = "https://repo.scoap3.org";
const VALID_FORMATS = new Set(["csv", "json"]);
const VALID_COUNTRY_LOGIC = new Set(["AND", "OR"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): Scoap3ExportFormat {
  const out = (format || "csv").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SCOAP3 export format: ${format}; SCOAP3 offers only csv/json`, { format, valid: [...VALID_FORMATS] });
  return out as Scoap3ExportFormat;
}
function normalizeCountryLogic(value?: string): Scoap3CountryLogic | undefined {
  if (!value) return undefined;
  const out = value.toUpperCase();
  if (!VALID_COUNTRY_LOGIC.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SCOAP3 country logic: ${value}`, { country_logic: value, valid: [...VALID_COUNTRY_LOGIC] });
  return out as Scoap3CountryLogic;
}
function values(value?: string | string[]): string[] { return (Array.isArray(value) ? value : value ? [value] : []).map((v) => String(v).trim()).filter(Boolean); }
function addRepeated(url: URL, key: string, value?: string | string[]): void { values(value).forEach((v) => url.searchParams.append(key, v)); }
function dateFromYear(value: number | string | undefined, end = false): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const year = asPositiveInt(raw, end ? "publication_year_lte" : "publication_year_gte");
  if (!year || year < 1800 || year > 2200) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "publication year must be a realistic YYYY value", { value });
  return `${year}-${end ? "12-31" : "01-01"}`;
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
function doiFromText(text: string): string { return (/\b10\.[0-9]{4,9}\/[A-Za-z0-9.\-_;()/:]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function arxivFromText(text: string): string { return (/arXiv(?: id)?:?\s*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z.-]+\/\d{7}(?:v\d+)?)/i.exec(text)?.[1] || "").trim(); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "scoap3"; }
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

export function buildScoap3SearchUrl(args: Scoap3SearchArgs): string {
  const url = new URL("/search", SCOAP3_ORIGIN);
  url.searchParams.set("search_simple_query_string", requireQuery(args.query));
  const page = asPositiveInt(args.page, "page");
  const size = asPositiveInt(args.size, "size");
  if (page) url.searchParams.set("page", String(page));
  if (size) url.searchParams.set("size", String(size));
  if (args.sort) url.searchParams.set("sort", args.sort);
  return url.toString();
}

export function buildScoap3FilterUrl(args: Scoap3FilterArgs): string {
  const url = new URL(buildScoap3SearchUrl(args));
  addRepeated(url, "journal", args.journal);
  addRepeated(url, "country", args.country);
  const countryLogic = normalizeCountryLogic(args.country_logic);
  if (countryLogic) url.searchParams.set("country_logic", countryLogic);
  const gte = dateFromYear(args.publication_year_gte, false);
  const lte = dateFromYear(args.publication_year_lte, true);
  if (gte) url.searchParams.set("publication_year__gte", gte);
  if (lte) url.searchParams.set("publication_year__lte", lte);
  return url.toString();
}

export function buildScoap3ResultsetExportUrl(args: Scoap3ExportArgs): string {
  const format = normalizeFormat(args.format);
  const searchUrl = new URL(buildScoap3FilterUrl(args));
  const url = new URL("/api/search/article/", SCOAP3_ORIGIN);
  searchUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  url.searchParams.set("all", "true");
  url.searchParams.set("format", format);
  return url.toString();
}

export function buildScoap3RecordExportUrl(recordId: string | number): string {
  const id = String(recordId || "").trim();
  if (!/^\d+$/.test(id)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "record_id must be a SCOAP3 numeric record id", { record_id: recordId });
  return new URL(`/api/records/${id}/`, SCOAP3_ORIGIN).toString();
}

export function parseScoap3ResultCount(text: string): number {
  const raw = /Found\s+([0-9,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SCOAP3 result count node was not found", { probe: "Found N results" });
  return Number(raw.replace(/,/g, ""));
}

export function parseScoap3ItemsFromHtml(html: string): Scoap3Item[] {
  const body = String(html || "");
  const links = [...body.matchAll(/<a[^>]+href=["'](\/records\/(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return links.map((match) => {
    const id = match[2];
    const title = cleanText(match[3] || "");
    const start = Math.max(0, match.index || 0);
    const next = body.slice(start).search(/<a[^>]+href=["']\/records\/\d+["']/i);
    const block = next > 0 ? body.slice(start, start + next) : body.slice(start, start + 3500);
    const text = cleanText(block);
    const doi = doiFromText(text);
    const journal = (/\b(?:Physical Review Letters|Physics Letters B|Journal of High Energy Physics|European Physical Journal C|Nuclear Physics B|Chinese Physics C|Universe)\b/i.exec(text)?.[0] || "").trim();
    const publication_date = (/\b(?:19\d{2}|20\d{2})-\d{2}-\d{2}\b/.exec(text)?.[0] || /\b(?:19\d{2}|20\d{2})\b/.exec(text)?.[0] || "").trim();
    return { id, title, doi, arxiv_id: arxivFromText(text), journal, publication_date, url: new URL(`/records/${id}`, SCOAP3_ORIGIN).toString() };
  }).filter((item, index, array) => item.id && item.title && array.findIndex((other) => other.id === item.id) === index).slice(0, 100);
}

export function parseScoap3ItemsFromVisibleText(text: string): Scoap3Item[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const chunks = [...normalized.matchAll(/(?:^|\s)(\d{5,}\b\s+[\s\S]*?)(?=\s+\d{5,}\b\s+[A-Z]|$)/g)].map((m) => m[1]);
  return chunks.map((chunk) => {
    const id = /^\s*(\d{5,})\b/.exec(chunk)?.[1] || "";
    const doi = doiFromText(chunk);
    const beforeDoi = doi ? chunk.split(doi)[0] : chunk;
    const title = beforeDoi.replace(/^\s*\d{5,}\s+/, "").split(/\s+(?:PDF|XML|doi|arXiv)\b/i)[0].trim().slice(0, 260);
    return { id, title, doi, arxiv_id: arxivFromText(chunk), journal: "", publication_date: (/\b(?:19\d{2}|20\d{2})-\d{2}-\d{2}\b/.exec(chunk)?.[0] || ""), url: id ? new URL(`/records/${id}`, SCOAP3_ORIGIN).toString() : "" };
  }).filter((item) => item.id || item.title || item.doi).slice(0, 100);
}

async function readScoap3ResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: Scoap3Item[]; exportHref: string }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseScoap3ResultCount(visibleText);
      const items = parseScoap3ItemsFromHtml(html);
      const exportHref = await page.locator('a[role="download"][href*="/api/search/article/"]').first().getAttribute("href").catch(() => "");
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseScoap3ItemsFromVisibleText(visibleText), exportHref: exportHref ? new URL(exportHref, SCOAP3_ORIGIN).toString() : "" };
      if (visibleText.length > 400 && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SCOAP3 results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedScoap3Page<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "SCOAP3 tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchScoap3Search(args: Scoap3SearchArgs): Promise<{ result_count: number; items: Scoap3Item[]; query_url: string; confirm_url: string; export_href: string }> {
  const query_url = buildScoap3SearchUrl(args);
  const profile = args.profile || "research-scoap3";
  const tabId = args.tab_id || `research-scoap3-search-${Date.now()}`;
  const page = await withAllocatedScoap3Page(profile, query_url, tabId, args.cdp_port, (p) => readScoap3ResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, confirm_url: page.url, export_href: page.exportHref };
}

export async function researchScoap3Filter(args: Scoap3FilterArgs): Promise<{ result_count: number; items: Scoap3Item[]; refined_url: string; confirm_url: string; export_href: string }> {
  const refined_url = buildScoap3FilterUrl(args);
  const profile = args.profile || "research-scoap3";
  const tabId = args.tab_id || `research-scoap3-filter-${Date.now()}`;
  const page = await withAllocatedScoap3Page(profile, refined_url, tabId, args.cdp_port, (p) => readScoap3ResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, export_href: page.exportHref };
}

export async function researchScoap3Export(args: Scoap3ExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: Scoap3ExportFormat | "record-json"; source_url: string }> {
  const profile = args.profile || "research-scoap3";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "scoap3"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const source_url = args.record_id !== undefined && args.record_id !== null ? buildScoap3RecordExportUrl(args.record_id) : buildScoap3ResultsetExportUrl(args);
  const format = args.record_id !== undefined && args.record_id !== null ? "record-json" : normalizeFormat(args.format);
  const filename = args.filename || (format === "record-json" ? `scoap3-record-${safeFileToken(String(args.record_id))}.json` : `scoap3-resultset-${safeFileToken(args.query)}.${format}`);
  const tabId = args.tab_id || `research-scoap3-export-${Date.now()}`;
  return await withAllocatedScoap3Page(profile, SCOAP3_ORIGIN, tabId, args.cdp_port, async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "SCOAP3 download returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, filename);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "csv") {
        if (!/^ID,Title,DOI,arXiv id,arXiv primary category,Journal,Publication Date,Record creation date/m.test(text) || !/Physical Review Letters|Higgs/i.test(text)) {
          throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SCOAP3 CSV artifact failed content validation", { artifact_path, source_url });
        }
      } else {
        try { JSON.parse(text); } catch (error) { throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SCOAP3 JSON artifact failed JSON validation", { artifact_path, cause: error instanceof Error ? error.message : String(error) }); }
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "SCOAP3 export failed", { source_url, cause: error?.message || String(error) });
    }
  });
}
