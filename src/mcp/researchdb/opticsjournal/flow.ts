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

export type OpticsjournalFieldType = "title" | "author" | "keyword" | "affiliation" | "first_author" | "first_affiliation" | "abstract" | "doi" | "cstr" | string;
export type OpticsjournalFacet = "journal" | "pubyear" | "author" | "topic_cn" | "topic_en";
export type OpticsjournalExportFormat = "enw" | "ref" | "txt" | "xml";

export interface OpticsjournalItem { title: string; authors: string[]; journal: string; year: number | null; doi: string; article_path: string; article_id: string; }
export interface OpticsjournalSearchArgs { query: string; field_type?: OpticsjournalFieldType; journal_scope?: string; year_from?: number; year_to?: number; sort?: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface OpticsjournalFilterArgs extends OpticsjournalSearchArgs { facet?: OpticsjournalFacet; facet_value?: string | number; journal_code?: string; pubyear?: number; author?: string; topic_cn?: string; topic_en?: string; }
export interface OpticsjournalExportArgs extends OpticsjournalFilterArgs { format?: OpticsjournalExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const OPTICSJOURNAL_ORIGIN = "https://www.opticsjournal.net";
const OPTICSJOURNAL_SEARCH_URL = "https://www.opticsjournal.net/Search";
const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  author: "作者",
  keyword: "关键词",
  affiliation: "作者单位",
  first_author: "第一作者",
  first_affiliation: "一作单位",
  abstract: "论文摘要",
  doi: "DOI",
  cstr: "CSTR"
};
const FACET_INPUTS: Record<OpticsjournalFacet, string> = {
  journal: 'input[name="journalFilter_check"]',
  pubyear: 'input[name="pubyearFilter_check"]',
  author: 'input[name="authorFilter_check"]',
  topic_cn: 'input[name="topicCNFilter_check"]',
  topic_en: 'input[name="topicENFilter_check"]'
};
const VALID_FORMATS = new Set(["enw", "ref", "txt", "xml"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function cleanText(value: string): string { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function attr(block: string, name: string): string { return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(block)?.[1] || ""; }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i.exec(text)?.[0] || "").replace(/[),.;，。]+$/, ""); }
function authorsFromText(text: string): string[] {
  const before = text.split(/作者单位|Author Affiliations|摘要|Abstract|PDF全文|Full Text|\b(19\d{2}|20\d{2})\b/)[0] || "";
  return before.replace(/^[^\s]+\s+/, "").split(/\s*[,，;；]\s*|\s{2,}|(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/u).map((s) => s.trim()).filter((s) => s && !/^(科研论文|综述|研究论文|专栏|AI|Video|Guide|Voice)$/i.test(s)).slice(0, 20);
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeFormat(format?: string): OpticsjournalExportFormat {
  const out = (format || "enw").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Opticsjournal export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as OpticsjournalExportFormat;
}
function resolveFacet(args: OpticsjournalFilterArgs): { facet: OpticsjournalFacet; value: string } | undefined {
  if (args.facet && args.facet_value !== undefined) return { facet: args.facet, value: String(args.facet_value) };
  if (args.journal_code) return { facet: "journal", value: String(args.journal_code) };
  if (args.pubyear) return { facet: "pubyear", value: String(args.pubyear) };
  if (args.author) return { facet: "author", value: String(args.author) };
  if (args.topic_cn) return { facet: "topic_cn", value: String(args.topic_cn) };
  if (args.topic_en) return { facet: "topic_en", value: String(args.topic_en) };
  return { facet: "pubyear", value: "2025" };
}

export function buildOpticsjournalSearchUrl(): string { return OPTICSJOURNAL_SEARCH_URL; }

export function buildOpticsjournalSearchForm(args: OpticsjournalSearchArgs): Record<string, string> {
  const form: Record<string, string> = { _title: requireQuery(args.query), _ktype: FIELD_LABELS[String(args.field_type || "title")] || String(args.field_type || "标题") };
  if (args.journal_scope) form._journal = args.journal_scope;
  const yearFrom = asPositiveInt(args.year_from, "year_from");
  const yearTo = asPositiveInt(args.year_to, "year_to");
  if (yearFrom) form.year_from = String(yearFrom);
  if (yearTo) form.year_to = String(yearTo);
  if (args.sort) form._sort = String(args.sort);
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) form.pageSize = String(pageSize);
  return form;
}

export function parseOpticsjournalResultCount(text: string): number {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const refined = /本次查询到\s*([\d,]+)\s*条符合条件的记录/.exec(normalized)?.[1];
  const total = /共找到\s*([\d,]+)\s*个内容/.exec(normalized)?.[1];
  const raw = refined || total;
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal result count node was not found", { probe: "div.alert.alert-warning.AllFindResult" });
  return Number(raw.replace(/,/g, ""));
}

export function parseOpticsjournalItemsFromHtml(html: string): OpticsjournalItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<div[^>]+class=["'][^"']*item[^"']*article[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*item[^"']*article[^"']*["']|<nav|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const titleAnchor = /<a[^>]+class=["'][^"']*(?:art-title|h4-tit)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const anchorHtml = titleAnchor?.[0] || "";
    const title = cleanText(titleAnchor?.[1] || "") || cleanText(block).slice(0, 180);
    const article_path = attr(anchorHtml, "href");
    const article_id = attr(anchorHtml, "data-aid") || /value=["'](OJ[^"']+)["']/i.exec(block)?.[1] || "";
    const text = cleanText(block);
    const journalYear = /(?:PDF全文\s+(?:Full Text\s+)?|Full Text\s+)(.+?)\s+(19\d{2}|20\d{2})\b/i.exec(text);
    const journal = (journalYear?.[1] || "").trim();
    return { title, authors: authorsFromText(text.replace(title, "")), journal, year: yearFromText(journalYear?.[0] || text), doi: doiFromText(text), article_path, article_id };
  }).filter((item) => item.title || item.article_id || item.article_path).slice(0, 100);
}

export function parseOpticsjournalItemsFromVisibleText(text: string): OpticsjournalItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/论文查询结果|选择下列全部论文/).pop() || normalized;
  const pieces = tail.split(/\s+(?:科研论文|研究论文|综述|专栏[:：]?)/).slice(1);
  return pieces.map((piece) => {
    const title = piece.split(/\s+(?:AI高清视频导读|AI Video Guide|AI语音播报|AI Voice)\s+/)[0].trim();
    const journalYear = /(?:PDF全文\s+(?:Full Text\s+)?|Full Text\s+)(.+?)\s+(19\d{2}|20\d{2})\b/i.exec(piece);
    return { title, authors: authorsFromText(piece.replace(title, "")), journal: (journalYear?.[1] || "").trim(), year: yearFromText(journalYear?.[0] || piece), doi: doiFromText(piece), article_path: "", article_id: "" };
  }).filter((item) => item.title).slice(0, 100);
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

async function withAllocatedOpticsjournalPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Opticsjournal tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function selectByLabelOrValue(page: any, selector: string, value?: string): Promise<void> {
  if (!value) return;
  const count = await page.locator(selector).count().catch(() => 0);
  if (!count) return;
  const chosen = await page.locator(selector).evaluate((select: any, wanted: string) => {
    const options = [...select.options] as any[];
    const option = options.find((o) => o.value === wanted || String(o.textContent || "").trim() === wanted || String(o.textContent || "").includes(wanted));
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, value).catch(() => false);
  if (!chosen) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Opticsjournal select option was not found", { selector, value });
}

async function selectYear(page: any, index: 0 | 1, year?: number): Promise<void> {
  if (!year) return;
  const ok = await page.evaluate(({ index, year }: any) => {
    const selects = Array.from(document.querySelectorAll("#f1 select")).filter((s: any) => Array.from(s.options).some((o: any) => String(o.value || o.textContent).includes(String(year))) && !["_ktype", "_sort", "pageSize"].includes(String((s as any).name || "")));
    const select = selects[index] as HTMLSelectElement | undefined;
    if (!select) return false;
    const option = Array.from(select.options).find((o: any) => o.value === String(year) || String(o.textContent || "").includes(String(year)));
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { index, year }).catch(() => false);
  if (!ok) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal year select was not found", { index, year });
}

async function runOpticsjournalSearch(page: any, args: OpticsjournalSearchArgs): Promise<void> {
  const query = requireQuery(args.query);
  const field = page.locator('input[name="_title"]').first();
  if (!(await field.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal keyword field was not found", { selector: 'input[name="_title"]' });
  await field.fill(query, { timeout: 10000 });
  await selectByLabelOrValue(page, "#_ktype", FIELD_LABELS[String(args.field_type || "title")] || args.field_type);
  await selectByLabelOrValue(page, "#beSelect2", args.journal_scope);
  await selectYear(page, 0, asPositiveInt(args.year_from, "year_from"));
  await selectYear(page, 1, asPositiveInt(args.year_to, "year_to"));
  await selectByLabelOrValue(page, 'select[name="_sort"]', args.sort);
  if (args.page_size) await selectByLabelOrValue(page, 'select[name="pageSize"]', String(asPositiveInt(args.page_size, "page_size")));
  const submit = page.locator("#submit").first();
  if (!(await submit.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal search submit was not found", { selector: "#submit" });
  await submit.click({ timeout: 10000 });
  await waitForResults(page);
}

async function waitForResults(page: any): Promise<void> {
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 45000) {
    const state = await page.evaluate(() => ({ url: location.href, countText: document.querySelector("div.alert.alert-warning.AllFindResult")?.textContent?.trim() || "", items: document.querySelectorAll("div.item.article").length })).catch(() => ({ url: page.url?.() || "", countText: "", items: 0 }));
    lastEvidence = state as Record<string, unknown>;
    if (String((state as any).url).includes("/Search/Article") && /共找到\s*[\d,]+\s*个内容/.test((state as any).countText) && Number((state as any).items) >= 1) return;
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Opticsjournal results page did not settle", lastEvidence);
}

async function readOpticsjournalPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; itemCount: number; items: OpticsjournalItem[]; url: string }> {
  let stable: any;
  let lastError: unknown;
  let lastCount = -1;
  for (let i = 0; i < 4; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseOpticsjournalResultCount(visibleText);
      const htmlItems = parseOpticsjournalItemsFromHtml(html);
      const itemCount = await page.locator("div.item.article").count().catch(() => htmlItems.length);
      stable = { visibleText, title, html, resultCount, itemCount, items: htmlItems.length ? htmlItems : parseOpticsjournalItemsFromVisibleText(visibleText), url: page.url?.() || "" };
      if (itemCount >= 1 && resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable || stable.itemCount < 1) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal results page did not hydrate article items", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function applyOpticsjournalFilter(page: any, args: OpticsjournalFilterArgs, before: { resultCount: number }): Promise<void> {
  const target = resolveFacet(args);
  if (!target) return;
  const selector = `${FACET_INPUTS[target.facet]}[data-value="${String(target.value).replace(/"/g, '\\"')}"]`;
  const input = page.locator(selector).first();
  if (!(await input.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal facet input was not found", { selector, facet: target.facet, value: target.value });
  await input.click({ timeout: 10000 });
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 45000) {
    const state = await page.evaluate(() => ({ countText: document.querySelector("div.alert.alert-warning.AllFindResult")?.textContent?.trim() || "", items: document.querySelectorAll("div.item.article").length })).catch(() => ({ countText: "", items: 0 }));
    let count: number | undefined;
    try { count = parseOpticsjournalResultCount((state as any).countText); } catch {}
    lastEvidence = { ...state as any, previousCount: before.resultCount, facet: target.facet, value: target.value };
    if (count !== undefined && count <= before.resultCount && Number((state as any).items) >= 1 && (/本次查询到/.test((state as any).countText) || count < before.resultCount)) return;
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Opticsjournal refine did not produce the verified count/list update", lastEvidence);
}

export async function researchOpticsjournalSearch(args: OpticsjournalSearchArgs): Promise<{ result_count: number; item_count: number; items: OpticsjournalItem[]; query_url: string; results_url: string; title: string; note: string }> {
  const profile = args.profile || "research-opticsjournal";
  const tabId = args.tab_id || `research-opticsjournal-search-${Date.now()}`;
  return await withAllocatedOpticsjournalPage(profile, buildOpticsjournalSearchUrl(), tabId, args.cdp_port, async (page) => {
    await runOpticsjournalSearch(page, args);
    const results = await readOpticsjournalPage(page);
    return { result_count: results.resultCount, item_count: results.itemCount, items: results.items, query_url: buildOpticsjournalSearchUrl(), results_url: results.url, title: results.title, note: "When no year range is set, opticsjournal.net applies an implicit latest ~4-year publication window." };
  });
}

export async function researchOpticsjournalFilter(args: OpticsjournalFilterArgs): Promise<{ result_count: number; item_count: number; items: OpticsjournalItem[]; refined_url: string; confirm_title: string; unfiltered_count: number }> {
  const profile = args.profile || "research-opticsjournal";
  const tabId = args.tab_id || `research-opticsjournal-filter-${Date.now()}`;
  return await withAllocatedOpticsjournalPage(profile, buildOpticsjournalSearchUrl(), tabId, args.cdp_port, async (page) => {
    await runOpticsjournalSearch(page, args);
    const before = await readOpticsjournalPage(page);
    await applyOpticsjournalFilter(page, args, before);
    const after = await readOpticsjournalPage(page);
    return { result_count: after.resultCount, item_count: after.itemCount, items: after.items, refined_url: after.url, confirm_title: after.title, unfiltered_count: before.resultCount };
  });
}

export async function researchOpticsjournalExport(args: OpticsjournalExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: OpticsjournalExportFormat; result_count: number; results_url: string; records: number }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-opticsjournal";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "opticsjournal"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-opticsjournal-export-${Date.now()}`;
  return await withAllocatedOpticsjournalPage(profile, buildOpticsjournalSearchUrl(), tabId, args.cdp_port, async (page) => {
    try {
      await runOpticsjournalSearch(page, args);
      let results = await readOpticsjournalPage(page);
      if (resolveFacet(args) && (args.facet || args.facet_value !== undefined || args.journal_code || args.pubyear || args.author || args.topic_cn || args.topic_en)) {
        await applyOpticsjournalFilter(page, args, results);
        results = await readOpticsjournalPage(page);
      }
      const selectAll = page.locator("#cbCheckAll").first();
      if (!(await selectAll.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal select-all checkbox was not found", { selector: "#cbCheckAll" });
      const checked = await selectAll.isChecked().catch(() => false);
      if (!checked) await selectAll.click({ timeout: 10000 });
      await selectByLabelOrValue(page, "#ASResultTo", format);
      const trigger = page.locator("#ASResultOK").first();
      if (!(await trigger.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Opticsjournal export trigger was not found", { selector: "#ASResultOK" });
      const clicked = await runArtifactClick({ profile, tabUrlContains: "opticsjournal.net/Search/Article", buttonSelector: "#ASResultOK", downloadDir, timeoutMs: 60000, locateTimeoutMs: 20000, frameMinCount: 0, filenamePattern: format === "enw" ? "*.enw" : undefined });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      const records = (text.match(/^%0 /mg) || []).length;
      if (format === "enw" && (records < 1 || !/^%T /m.test(text) || !/^%J /m.test(text) || !text.includes("%W 中国光学期刊网"))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Opticsjournal EndNote artifact failed content validation", { artifact_path, records });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: results.resultCount, results_url: results.url, records };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /download|timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "Opticsjournal export failed", { format, cause: error?.message || String(error) });
    }
  });
}
