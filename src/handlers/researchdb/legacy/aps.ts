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

export type ApsSearchField = "all" | "author" | "abstract" | "abstitle" | "title" | "citedauthor" | "affiliation" | "collaboration" | "keyword";
export type ApsOperator = "AND" | "OR" | "NOT";
export type ApsDateRange = "week" | "month" | "year" | "Past Week" | "Past Month" | "Past Year";
export type ApsExportFormat = "ris" | "bibtex";

export interface ApsClause { field?: ApsSearchField | string; value: string; operator?: ApsOperator | string; }
export interface ApsItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; article_url: string; }
export interface ApsSearchArgs { query?: string; field?: ApsSearchField | string; clauses?: ApsClause[]; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface ApsFilterArgs extends ApsSearchArgs { date_range?: ApsDateRange | string; }
export interface ApsExportArgs { doi: string; journal_code?: string; article_url?: string; format?: ApsExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const APS_ORIGIN = "https://journals.aps.org";
const VALID_FIELDS = new Set(["all", "author", "abstract", "abstitle", "title", "citedauthor", "affiliation", "collaboration", "keyword"]);
const VALID_OPERATORS = new Set(["AND", "OR", "NOT"]);
const VALID_FORMATS = new Set(["ris", "bibtex"]);
const DATE_PARAM: Record<string, string> = { week: "week", month: "month", year: "year", "Past Week": "week", "Past Month": "month", "Past Year": "year" };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query?: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim().replace(/^https?:\/\/doi\.org\//i, "").replace(/[?#].*$/, "").replace(/[),.;]+$/, "");
}
function normalizeField(field?: string): ApsSearchField {
  const out = (field || "all").toLowerCase();
  if (!VALID_FIELDS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported APS search field: ${field}`, { field, valid: [...VALID_FIELDS] });
  return out as ApsSearchField;
}
function normalizeOperator(operator?: string): ApsOperator {
  const out = (operator || "AND").toUpperCase();
  if (!VALID_OPERATORS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported APS boolean operator: ${operator}`, { operator, valid: [...VALID_OPERATORS] });
  return out as ApsOperator;
}
function normalizeFormat(format?: string): ApsExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported APS export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as ApsExportFormat;
}
function normalizeDateRange(dateRange?: string): string | undefined {
  if (!dateRange) return undefined;
  const direct = DATE_PARAM[dateRange] || DATE_PARAM[dateRange.toLowerCase()];
  if (!direct) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported APS date range: ${dateRange}`, { date_range: dateRange, valid: Object.keys(DATE_PARAM) });
  return direct;
}
function normalizeJournalCode(journalCode?: string): string {
  const out = (journalCode || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "journal_code is required for APS export and must be an APS URL journal code, e.g. prl", { journal_code: journalCode });
  return out;
}
function normalizeClauses(args: ApsSearchArgs): Array<{ field: string; value: string; operator: ApsOperator }> {
  const clauses = args.clauses?.length ? args.clauses : [{ field: args.field || "all", value: requireQuery(args.query), operator: "AND" }];
  return clauses.map((clause) => ({ field: normalizeField(clause.field), value: requireQuery(clause.value), operator: normalizeOperator(clause.operator) }));
}

export function buildApsSearchUrl(args: ApsSearchArgs): string {
  const url = new URL("/search/results", APS_ORIGIN);
  url.searchParams.set("clauses", JSON.stringify(normalizeClauses(args)));
  url.searchParams.set("sort", "recent");
  url.searchParams.set("per_page", String(asPositiveInt(args.page_size, "page_size") || 20));
  return url.toString();
}

export function buildApsFilterUrl(args: ApsFilterArgs): string {
  const url = new URL(buildApsSearchUrl(args));
  const date = normalizeDateRange(args.date_range);
  if (date) {
    const perPage = url.searchParams.get("per_page") || "20";
    url.searchParams.delete("per_page");
    url.searchParams.set("date", date);
    url.searchParams.set("per_page", perPage);
  }
  return url.toString();
}

export function buildApsArticleUrl(journalCode: string, doi: string): string {
  return new URL(`/${normalizeJournalCode(journalCode)}/abstract/${requireDoi(doi)}`, APS_ORIGIN).toString();
}

export function buildApsExportUrl(journalCode: string, doi: string, format: ApsExportFormat | string = "ris"): string {
  const url = new URL(`/${normalizeJournalCode(journalCode)}/export/${requireDoi(doi)}`, APS_ORIGIN);
  url.searchParams.set("type", normalizeFormat(format));
  url.searchParams.set("download", "true");
  return url.toString();
}

export function parseApsResultCount(text: string): number {
  const match = /\b\d[\d,]*\s*-\s*\d[\d,]*\s+of\s+([\d,]+)\s+Results\b/i.exec(String(text || ""));
  if (!match) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "APS result count node was not found", { probe: "1-20 of N Results" });
  return Number(match[1].replace(/,/g, ""));
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
function cleanText(value: string): string { return decodeEntities(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function normalizeDoi(value: string): string { return requireDoi(decodeEntities(value)); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function authorsFromText(text: string, title: string): string[] {
  const stripped = text.replace(title, " ").split(/\b(?:Abstract|PDF|Download PDF|Viewpoint|Published|DOI|Physics|Results)\b/i)[0] || "";
  return unique(stripped.split(/,| and /).map((s) => s.trim()).filter((s) => /^[A-Z][A-Za-z.' -]+(?:\s+[A-Z][A-Za-z.' -]+)+$/.test(s))).slice(0, 12);
}

export function parseApsItemsFromHtml(html: string): ApsItem[] {
  const source = String(html || "");
  const matches = [...source.matchAll(/href=["']\/(\w[\w-]*)\/abstract\/(10\.1103\/[^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  return matches.map((m) => {
    const journal = m[1].toLowerCase();
    const doi = normalizeDoi(m[2]);
    const key = `${journal}:${doi}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const idx = source.indexOf(m[0]);
    const block = idx >= 0 ? source.slice(Math.max(0, idx - 2500), Math.min(source.length, idx + 3500)) : source;
    const title = cleanText(m[3]) || cleanText(block).slice(0, 180);
    const text = cleanText(block);
    return { title, authors: authorsFromText(text, title), doi, journal, year: yearFromText(text), article_url: buildApsArticleUrl(journal, doi) };
  }).filter((item): item is ApsItem => !!item && (!!item.title || !!item.doi)).slice(0, 100);
}

export function parseApsItemsFromVisibleText(text: string): ApsItem[] {
  const source = String(text || "").replace(/\s+/g, " ");
  const dois = unique([...source.matchAll(/(10\.1103\/[A-Za-z0-9._/-]+)/gi)].map((m) => normalizeDoi(m[1]))).slice(0, 100);
  return dois.map((doi) => {
    const idx = source.indexOf(doi);
    const before = idx >= 0 ? source.slice(Math.max(0, idx - 700), idx) : source;
    const title = before.split(/\b(?:Authors?|Published|Phys\. Rev\.|Physical Review|DOI)\b/i).pop()?.trim().slice(0, 180) || "";
    return { title, authors: authorsFromText(before, title), doi, journal: "", year: yearFromText(before), article_url: "" };
  });
}

async function readApsPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: ApsItem[] }> {
  let lastCount = -1;
  let lastItems = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseApsResultCount(visibleText);
      const htmlItems = parseApsItemsFromHtml(html);
      const items = htmlItems.length ? htmlItems : parseApsItemsFromVisibleText(visibleText);
      stable = { visibleText, title, html, resultCount, items };
      if (resultCount === lastCount && items.length === lastItems) break;
      lastCount = resultCount;
      lastItems = items.length;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "APS results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedApsPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "APS tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchApsSearch(args: ApsSearchArgs): Promise<{ result_count: number; items: ApsItem[]; query_url: string }> {
  const query_url = buildApsSearchUrl(args);
  const profile = args.profile || "research-aps";
  const tabId = args.tab_id || `research-aps-search-${Date.now()}`;
  const page = await withAllocatedApsPage(profile, query_url, tabId, args.cdp_port ?? 9244, (p) => readApsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchApsFilter(args: ApsFilterArgs): Promise<{ result_count: number; items: ApsItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildApsFilterUrl(args);
  const profile = args.profile || "research-aps";
  const tabId = args.tab_id || `research-aps-filter-${Date.now()}`;
  const page = await withAllocatedApsPage(profile, refined_url, tabId, args.cdp_port ?? 9244, (p) => readApsPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchApsExport(args: ApsExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: ApsExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const articleUrl = args.article_url || buildApsArticleUrl(normalizeJournalCode(args.journal_code), doi);
  const profile = args.profile || "research-aps";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "aps"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-aps-export-${Date.now()}`;
  try {
    return await withAllocatedApsPage(profile, articleUrl, tabId, args.cdp_port ?? 9244, async (page) => {
      for (let i = 0; i < 3; i++) {
        if (await page.locator('button.export-article-citation:not(.sm-primary-button)').count().catch(() => 0)) break;
        await sleep(1500);
      }
      const trigger = page.locator('button.export-article-citation:not(.sm-primary-button)').first();
      if (!(await trigger.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "APS export citation button was not found", { selector: 'button.export-article-citation:not(.sm-primary-button)', articleUrl });
      await trigger.click({ timeout: 10000 });
      for (let i = 0; i < 3; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (/Choose format for download/i.test(text) && await page.locator('input[name="export_format"]').count().catch(() => 0)) break;
        await sleep(1000);
      }
      const radio = `input[name="export_format"][value="${format}"]`;
      if (!(await page.locator(radio).count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "APS export format radio was not found", { selector: radio, articleUrl });
      await page.locator(radio).click({ timeout: 10000 });
      const clicked = await runArtifactClick({
        profile,
        url: articleUrl,
        buttonSelector: "#download-citation",
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 10000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - JOUR/m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "APS RIS artifact failed content validation", { artifact_path, doi });
      }
      if (format === "bibtex" && !text.includes(doi)) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "APS BibTeX artifact failed content validation", { artifact_path, doi });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    });
  } catch (error: any) {
    if (error instanceof WebAiToolError) throw error;
    const raw = String(error?.errorCode || error?.message || error);
    const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
      ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
      : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
      : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
      : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
    throw new WebAiToolError(code, "APS export failed", { doi, format, cause: error?.message || String(error) });
  } finally {
    await freeSession(tabId).catch(() => undefined);
  }
}
