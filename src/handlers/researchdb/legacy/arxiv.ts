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

export type ArxivSearchField = "all" | "title" | "author" | "abstract" | "comments" | "journal_ref" | "acm_class" | "msc_class" | "report_num" | "paper_id" | "doi" | "orcid" | "license" | "author_id" | "help" | "full_text";
export type ArxivBooleanOperator = "AND" | "OR" | "NOT";
export type ArxivDateFilter = "all_dates" | "past_12" | "specific_year" | "date_range";
export type ArxivDateType = "submitted_date" | "submitted_date_first" | "announced_date_first";
export type ArxivOrder = "-announced_date_first" | "announced_date_first" | "-submitted_date" | "submitted_date" | "";
export type ArxivExportFormat = "bibtex";

export interface ArxivTerm { term: string; field?: ArxivSearchField | string; operator?: ArxivBooleanOperator | string; }
export interface ArxivItem { id: string; title: string; authors: string[]; abstract: string; categories: string[]; year: number | null; abs_url: string; pdf_url: string; doi: string; }
export interface ArxivSearchArgs { query?: string; field?: ArxivSearchField | string; terms?: ArxivTerm[]; page_size?: number; order?: ArxivOrder | string; profile?: string; cdp_port?: number; tab_id?: string; }
export interface ArxivFilterArgs extends ArxivSearchArgs { subject?: string; physics_archive?: string; include_cross_list?: "include" | "exclude" | string; date_filter_by?: ArxivDateFilter | string; year?: number; from_date?: string; to_date?: string; date_type?: ArxivDateType | string; abstracts?: "show" | "hide" | string; include_older_versions?: boolean; }
export interface ArxivExportArgs { id: string; format?: ArxivExportFormat | string; filename?: string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const ARXIV_ORIGIN = "https://arxiv.org";
const VALID_FIELDS = new Set(["all", "title", "author", "abstract", "comments", "journal_ref", "acm_class", "msc_class", "report_num", "paper_id", "doi", "orcid", "license", "author_id", "help", "full_text"]);
const VALID_OPERATORS = new Set(["AND", "OR", "NOT"]);
const VALID_DATE_FILTERS = new Set(["all_dates", "past_12", "specific_year", "date_range"]);
const VALID_DATE_TYPES = new Set(["submitted_date", "submitted_date_first", "announced_date_first"]);
const VALID_ORDERS = new Set(["-announced_date_first", "announced_date_first", "-submitted_date", "submitted_date", ""]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function addOptional(url: URL, key: string, value: unknown): void {
  if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
}
function normalizeField(field?: string): ArxivSearchField {
  const out = field || "all";
  if (!VALID_FIELDS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv search field: ${out}`, { field, valid: [...VALID_FIELDS] });
  return out as ArxivSearchField;
}
function normalizeOperator(operator?: string): ArxivBooleanOperator {
  const out = (operator || "AND").toUpperCase();
  if (!VALID_OPERATORS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv boolean operator: ${operator}`, { operator, valid: [...VALID_OPERATORS] });
  return out as ArxivBooleanOperator;
}
function normalizeOrder(order?: string): ArxivOrder {
  const out = order === undefined ? "-announced_date_first" : order;
  if (!VALID_ORDERS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv sort order: ${order}`, { order, valid: [...VALID_ORDERS] });
  return out as ArxivOrder;
}
function normalizeDateFilter(value?: string): ArxivDateFilter {
  const out = value || "all_dates";
  if (!VALID_DATE_FILTERS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv date filter: ${value}`, { date_filter_by: value, valid: [...VALID_DATE_FILTERS] });
  return out as ArxivDateFilter;
}
function normalizeDateType(value?: string): ArxivDateType {
  const out = value || "submitted_date";
  if (!VALID_DATE_TYPES.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv date type: ${value}`, { date_type: value, valid: [...VALID_DATE_TYPES] });
  return out as ArxivDateType;
}
function requireTerms(args: ArxivSearchArgs): ArxivTerm[] {
  const terms = args.terms && args.terms.length ? args.terms : [{ term: args.query || "", field: args.field || "all", operator: "AND" }];
  const cleaned = terms.map((row, index) => {
    const term = String(row.term || "").trim();
    if (!term) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `terms[${index}].term is required`, { terms: args.terms, query: args.query });
    return { term, field: normalizeField(row.field), operator: normalizeOperator(row.operator) };
  });
  if (!cleaned.length) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query or terms are required");
  return cleaned;
}
export function normalizeArxivId(id: string): string {
  const trimmed = String(id || "").trim().replace(/^arXiv:/i, "").replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf|bibtex)\//i, "").replace(/\.pdf$/i, "");
  if (!/^\d{4}\.\d{4,5}(?:v\d+)?$|^[a-z.-]+\/\d{7}(?:v\d+)?$/i.test(trimmed)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "A valid arXiv id is required", { id });
  return trimmed;
}
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "arxiv"; }
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

export function buildArxivSearchUrl(args: ArxivSearchArgs): string {
  const url = new URL("/search/advanced", ARXIV_ORIGIN);
  url.searchParams.set("advanced", "1");
  requireTerms(args).forEach((row, index) => {
    url.searchParams.set(`terms-${index}-operator`, row.operator || "AND");
    url.searchParams.set(`terms-${index}-term`, row.term);
    url.searchParams.set(`terms-${index}-field`, row.field || "all");
  });
  url.searchParams.set("classification-physics_archives", "all");
  url.searchParams.set("classification-include_cross_list", "include");
  url.searchParams.set("date-filter_by", "all_dates");
  url.searchParams.set("date-year", "");
  url.searchParams.set("date-from_date", "");
  url.searchParams.set("date-to_date", "");
  url.searchParams.set("date-date_type", "submitted_date");
  url.searchParams.set("abstracts", "show");
  url.searchParams.set("size", String(asPositiveInt(args.page_size, "page_size") || 50));
  url.searchParams.set("order", normalizeOrder(args.order));
  return url.toString();
}

export function buildArxivFilterUrl(args: ArxivFilterArgs): string {
  const url = new URL(buildArxivSearchUrl(args));
  if (args.subject) url.searchParams.set(`classification-${args.subject}`, "y");
  if (args.physics_archive) url.searchParams.set("classification-physics_archives", args.physics_archive);
  if (args.include_cross_list) url.searchParams.set("classification-include_cross_list", args.include_cross_list);
  const dateFilter = normalizeDateFilter(args.date_filter_by || (args.year ? "specific_year" : (args.from_date || args.to_date) ? "date_range" : undefined));
  url.searchParams.set("date-filter_by", dateFilter);
  if (args.year !== undefined) url.searchParams.set("date-year", String(asPositiveInt(args.year, "year")));
  addOptional(url, "date-from_date", args.from_date);
  addOptional(url, "date-to_date", args.to_date);
  url.searchParams.set("date-date_type", normalizeDateType(args.date_type));
  if (args.abstracts) url.searchParams.set("abstracts", args.abstracts);
  if (args.include_older_versions) url.searchParams.set("include_older_versions", "y");
  return url.toString();
}

export function buildArxivBibtexUrl(id: string): string {
  return new URL(`/bibtex/${normalizeArxivId(id)}`, ARXIV_ORIGIN).toString();
}

export function parseArxivResultCount(text: string): number {
  const raw = /Showing\s+\d+\s*[–-]\s*\d+\s+of\s+([\d,]+)\s+results/i.exec(text || "")?.[1]
    || /of\s+([\d,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "arXiv result count node was not found", { probe: "h1.title.is-clearfix" });
  return Number(raw.replace(/,/g, ""));
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/\b10\.[0-9]{4,9}\/[^\s,;]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function htmlClassText(block: string, tag: string, className: string): string {
  const pattern = new RegExp(`<${tag}[^>]+class=["']([^"']*)["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  for (const match of block.matchAll(pattern)) {
    const classes = String(match[1] || "").split(/\s+/);
    if (classes.includes(className)) return cleanText(match[2] || "");
  }
  return "";
}
function authorsFromText(text: string): string[] { return String(text || "").split(/,| and /).map((s) => s.trim()).filter(Boolean).slice(0, 20); }

export function parseArxivItemsFromHtml(html: string): ArxivItem[] {
  const blocks = [...String(html || "").matchAll(/<li[^>]+class=["'][^"']*arxiv-result[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*arxiv-result|<\/ol>|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const id = (/arXiv:\s*([^\s\[]+)/i.exec(text)?.[1] || "").trim();
    const href = /<p[^>]+class=["'][^"']*list-title[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1] || (id ? `/abs/${id}` : "");
    const abs_url = href ? new URL(href, ARXIV_ORIGIN).toString() : "";
    const title = htmlClassText(block, "p", "title")
      || text.split(/Authors?:/i)[0].replace(/^arXiv:\s*\S+\s*(?:\[[^\]]+\])?\s*/, "").trim().slice(0, 260);
    const authorPart = (/Authors?:\s*([\s\S]*?)(?:Abstract:|Submitted|Comments:|Subjects:|$)/i.exec(text)?.[1] || "").trim();
    const abstract = (/Abstract:\s*([\s\S]*?)(?:▽ More|Submitted|Comments:|Subjects:|$)/i.exec(text)?.[1] || "").trim();
    const categories = [...text.matchAll(/\b(?:cs|math|eess|stat|physics|astro-ph|cond-mat|gr-qc|hep-[a-z]+|quant-ph|q-[a-z]+)\.[A-Z]{2}\b/g)].map((m) => m[0]);
    return { id, title, authors: authorsFromText(authorPart), abstract, categories, year: yearFromText(text), abs_url, pdf_url: id ? new URL(`/pdf/${id}`, ARXIV_ORIGIN).toString() : "", doi: doiFromText(text) };
  }).filter((item) => item.id || item.title).slice(0, 100);
}

export function parseArxivItemsFromVisibleText(text: string): ArxivItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const records = normalized.split(/\barXiv:/i).slice(1);
  return records.map((record) => {
    const id = (record.match(/^\s*([^\s\[]+)/)?.[1] || "").trim();
    const beforeAuthors = record.split(/Authors?:/i)[0] || "";
    const title = beforeAuthors.replace(/^\s*[^\s\[]+\s*(?:\[[^\]]+\])?\s*(?:[a-z.-]+(?:\s+[a-z.-]+)*\s*)?/i, "").trim().slice(0, 260);
    const authorPart = (/Authors?:\s*(.*?)(?:Abstract:|Submitted|Comments:|Subjects:|$)/i.exec(record)?.[1] || "").trim();
    const abstract = (/Abstract:\s*(.*?)(?:▽ More|Submitted|Comments:|Subjects:|$)/i.exec(record)?.[1] || "").trim();
    return { id, title, authors: authorsFromText(authorPart), abstract, categories: [], year: yearFromText(record), abs_url: id ? new URL(`/abs/${id}`, ARXIV_ORIGIN).toString() : "", pdf_url: id ? new URL(`/pdf/${id}`, ARXIV_ORIGIN).toString() : "", doi: doiFromText(record) };
  }).filter((item) => item.id || item.title).slice(0, 100);
}

async function readArxivResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: ArxivItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 24; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const resultCount = parseArxivResultCount(visibleText);
      const itemCount = await page.locator("li.arxiv-result").count().catch(() => 0);
      const items = parseArxivItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseArxivItemsFromVisibleText(visibleText) };
      if (itemCount > 0 && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(500);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "arXiv results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedArxivPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "arXiv tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchArxivSearch(args: ArxivSearchArgs): Promise<{ result_count: number; items: ArxivItem[]; query_url: string }> {
  const query_url = buildArxivSearchUrl(args);
  const profile = args.profile || "research-arxiv";
  const tabId = args.tab_id || `research-arxiv-search-${Date.now()}`;
  const page = await withAllocatedArxivPage(profile, query_url, tabId, (args.cdp_port || 9257), (p) => readArxivResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchArxivFilter(args: ArxivFilterArgs): Promise<{ result_count: number; items: ArxivItem[]; refined_url: string; confirm_url: string; confirm_title: string }> {
  const refined_url = buildArxivFilterUrl(args);
  const profile = args.profile || "research-arxiv";
  const tabId = args.tab_id || `research-arxiv-filter-${Date.now()}`;
  const page = await withAllocatedArxivPage(profile, refined_url, tabId, (args.cdp_port || 9257), (p) => readArxivResultsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchArxivExport(args: ArxivExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: "bibtex"; id: string; source_url: string }> {
  const id = normalizeArxivId(args.id);
  const format = (args.format || "bibtex").toLowerCase();
  if (format !== "bibtex") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported arXiv export format: ${args.format}`, { format: args.format, valid: ["bibtex"] });
  const profile = args.profile || "research-arxiv";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "arxiv"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const source_url = buildArxivBibtexUrl(id);
  const filename = args.filename || `arxiv-${safeFileToken(id)}.bib`;
  const tabId = args.tab_id || `research-arxiv-export-${Date.now()}`;
  return await withAllocatedArxivPage(profile, ARXIV_ORIGIN, tabId, (args.cdp_port || 9257), async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "arXiv BibTeX download returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, filename);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^@\w+\{[^,]+,/m.test(text) || !text.includes(`eprint={${id.replace(/v\d+$/i, "")}}`) || !/archivePrefix=\{arXiv\}/.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "arXiv BibTeX artifact failed content validation", { artifact_path, id });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format: "bibtex", id, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "arXiv export failed", { id, source_url, cause: error?.message || String(error) });
    }
  });
}
