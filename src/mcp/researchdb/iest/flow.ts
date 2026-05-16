const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { artifactClickOnPage } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type IestSearchField = "all" | "alternative-title" | "publisher" | "affiliation" | "subject" | "abstract" | "fulltext" | "title" | "identifier" | "author";
export type IestAccessFacet = "All Content" | "Open Access" | "Free";
export type IestExportFormat = "ris" | "bib" | "enw";

export interface IestItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; article_path: string; }
export interface IestSearchArgs { query: string; field?: IestSearchField | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface IestFilterArgs extends IestSearchArgs { access?: IestAccessFacet | string; type?: string; from_year?: number; to_year?: number; refine_query?: string; refine_field?: IestSearchField | string; }
export interface IestExportArgs { article_url?: string; article_path?: string; format?: IestExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const IEST_ORIGIN = "https://jiest.kglmeridian.com";
const VALID_FIELDS = new Set(["all", "alternative-title", "publisher", "affiliation", "subject", "abstract", "fulltext", "title", "identifier", "author"]);
const VALID_FORMATS = new Set(["ris", "bib", "enw"]);

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
function normalizeField(field?: string): IestSearchField {
  const out = field || "all";
  if (!VALID_FIELDS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEST search field: ${out}`, { field, valid: [...VALID_FIELDS] });
  return out as IestSearchField;
}
function normalizeFormat(format?: string): IestExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEST export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as IestExportFormat;
}
function cleanText(value: string): string {
  return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.17764\/[^\s<)]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function articlePathFromHref(href: string): string { try { const url = new URL(href, IEST_ORIGIN); return url.pathname; } catch { return href || ""; } }
function authorsFromText(text: string): string[] {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  const match = /(?:Author(?:s)?|By)\s*[:：]?\s+(.+?)(?:\s+(?:Journal of the IEST|J\.?\s*IEST|\b19\d{2}\b|\b20\d{2}\b|DOI|Abstract|Volume|Issue)|$)/i.exec(compact);
  return (match?.[1] || "").split(/;|,|\band\b/i).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

export function buildIestSearchUrl(args: IestSearchArgs): string {
  const url = new URL("/search", IEST_ORIGIN);
  url.searchParams.set("q[0]", requireQuery(args.query));
  return url.toString();
}

export function buildIestFilterUrl(args: IestFilterArgs): string {
  const url = new URL(buildIestSearchUrl(args));
  const from = asPositiveInt(args.from_year, "from_year");
  const to = asPositiveInt(args.to_year, "to_year");
  if (from) url.searchParams.set("fromDate", String(from));
  if (to) url.searchParams.set("toDate", String(to));
  if (args.access) url.searchParams.set("access", String(args.access));
  if (args.type) url.searchParams.set("type", String(args.type));
  if (args.refine_query) {
    url.searchParams.set("q[1]", args.refine_query);
    url.searchParams.set("field[1]", normalizeField(args.refine_field));
  }
  return url.toString();
}

export function buildIestArticleUrl(args: IestExportArgs): string {
  const raw = args.article_url || args.article_path;
  if (!raw || !raw.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "article_url or article_path is required for IEST export");
  const url = new URL(raw, IEST_ORIGIN);
  if (url.hostname !== "jiest.kglmeridian.com") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "IEST export URL must be on jiest.kglmeridian.com", { article_url: raw });
  url.hash = "";
  return url.toString();
}

export function parseIestResultCount(text: string): number {
  const raw = /You are looking at\s*\d+\s*-\s*\d+\s*of\s*([\d,]+)\s*items/i.exec(String(text || "").replace(/\s+/g, " "))?.[1]
    || /of\s*([\d,]+)\s*items/i.exec(String(text || "").replace(/\s+/g, " "))?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST result count node was not found", { probe: "You are looking at 1-10 of N items" });
  return Number(raw.replace(/,/g, ""));
}

export function parseIestItemsFromHtml(html: string): IestItem[] {
  const source = String(html || "");
  const anchors = [...source.matchAll(/<a\b[^>]*href=["']([^"']*\/view\/journals\/jiet\/[^"']*article-p\d+\.xml[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  return anchors.map((match) => {
    const href = match[1];
    const pathKey = articlePathFromHref(href);
    if (seen.has(pathKey)) return undefined;
    seen.add(pathKey);
    const title = cleanText(match[2]);
    const start = Math.max(0, match.index ? match.index - 1000 : 0);
    const end = Math.min(source.length, (match.index || 0) + match[0].length + 1800);
    const block = source.slice(start, end);
    const text = cleanText(block);
    return { title, authors: authorsFromText(text), doi: doiFromText(text), journal: /Journal of the IEST/i.test(text) ? "Journal of the IEST" : "", year: yearFromText(text), article_path: pathKey };
  }).filter((item): item is IestItem => !!item && !!item.title && /\/view\/journals\/jiet\//.test(item.article_path)).slice(0, 100);
}

export function parseIestItemsFromDomRows(rows: Array<{ text: string; title?: string; href?: string }>): IestItem[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const pathKey = articlePathFromHref(row.href || "");
    if (!pathKey || seen.has(pathKey)) return undefined;
    seen.add(pathKey);
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    return { title: (row.title || text.split(/Author|Journal of the IEST|DOI|Abstract/i)[0] || "").trim(), authors: authorsFromText(text), doi: doiFromText(text), journal: /Journal of the IEST/i.test(text) ? "Journal of the IEST" : "", year: yearFromText(text), article_path: pathKey };
  }).filter((item): item is IestItem => !!item && !!item.title).slice(0, 100);
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

async function withAllocatedIestPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IEST tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function dismissIestCookieToast(page: any): Promise<void> {
  const button = page.locator('#toast\\:cookieBanner button').first();
  if (await button.count().catch(() => 0)) await button.click({ timeout: 5000 }).catch(() => undefined);
}

async function waitForIestResults(page: any, expectedPath = "/search"): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: IestItem[]; url: string }> {
  let stable: any;
  let lastItemCount = -1;
  let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      await dismissIestCookieToast(page);
      const state = await page.evaluate?.(() => ({ readyState: document.readyState, path: location.pathname, search: location.search, itemCount: document.querySelectorAll('a[href*="/view/journals/jiet/"][href*="article-p"]').length })).catch(() => ({ readyState: "unknown", path: "", search: "", itemCount: 0 }));
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseIestResultCount(visibleText);
      const rows = await page.locator('a[href*="/view/journals/jiet/"][href*="article-p"]').evaluateAll((els: any[]) => els.slice(0, 100).map((el: any) => {
        let p = el;
        let text = "";
        for (let i = 0; p && i < 6; i++, p = p.parentElement) text += ` ${(p.innerText || p.textContent || "").slice(0, 1500)}`;
        return { text, title: (el.textContent || "").trim(), href: el.getAttribute("href") || "" };
      })).catch(() => []);
      if (state.path !== expectedPath) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST results page path did not match requested search", { expectedPath, observedPath: state.path, url: page.url?.() });
      const items = parseIestItemsFromDomRows(rows as Array<{ text: string; title?: string; href?: string }>);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseIestItemsFromHtml(html), url: page.url?.() || "", itemCount: Number(state.itemCount) || items.length };
      if (stable.itemCount >= 1 && stable.itemCount === lastItemCount) break;
      lastItemCount = stable.itemCount;
    } catch (error) { lastError = error; }
    await sleep(2500);
  }
  if (!stable || stable.itemCount < 1) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST results page did not hydrate article items", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function clickIestVisibleButtonText(page: any, text: string): Promise<void> {
  const clicked = await page.evaluate((wanted: string) => {
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const candidates = buttons.filter((button) => (button.textContent || '').trim().toLowerCase() === wanted.toLowerCase());
    const button = candidates.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || candidates[0];
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `IEST button was not found: ${text}`, { text });
}

async function setIestSelectValue(page: any, selector: string, value: string): Promise<void> {
  const changed = await page.evaluate((payload: { selector: string; value: string }) => {
    const candidates = Array.from(document.querySelectorAll(payload.selector)) as HTMLSelectElement[];
    const select = candidates.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || candidates[0];
    if (!select) return false;
    select.value = payload.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { selector, value });
  if (!changed) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST select was not found", { selector, value });
}

async function clickAccordionByText(page: any, text: string): Promise<void> {
  const trigger = page.locator('button.chakra-accordion__itemTrigger').filter({ hasText: text }).first();
  if (!(await trigger.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `IEST accordion trigger was not found: ${text}`, { text });
  await trigger.click({ timeout: 10000 }).catch(async () => trigger.click({ timeout: 10000, force: true }));
  await sleep(500);
}

async function applyIestFilters(page: any, args: IestFilterArgs, before: { url: string; resultCount: number }): Promise<void> {
  await dismissIestCookieToast(page);
  const drawer = page.locator('button').filter({ hasText: /^\s*Filter\s*&\s*Refine\s*$/i }).first();
  if (await drawer.count().catch(() => 0)) await drawer.click({ timeout: 10000 }).catch(async () => drawer.click({ timeout: 10000, force: true }));
  await sleep(700);
  if (args.access) {
    await clickAccordionByText(page, "Refine by Access");
    const access = page.locator('button, a, label, [role="button"]').filter({ hasText: new RegExp(String(args.access).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    if (!(await access.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST access facet option was not found", { access: args.access });
    await access.click({ timeout: 10000 }).catch(async () => access.click({ timeout: 10000, force: true }));
  } else if (args.type) {
    await clickAccordionByText(page, "Refine by Type");
    const type = page.locator('button, a, label, [role="button"]').filter({ hasText: new RegExp(String(args.type).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    if (!(await type.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST type facet option was not found", { type: args.type });
    await type.click({ timeout: 10000 }).catch(async () => type.click({ timeout: 10000, force: true }));
  } else if (args.from_year || args.to_year) {
    await clickAccordionByText(page, "Refine by Date");
    const from = asPositiveInt(args.from_year, "from_year");
    const to = asPositiveInt(args.to_year, "to_year");
    if (from) await setIestSelectValue(page, 'select[name="fromDate"]', String(from));
    if (to) await setIestSelectValue(page, 'select[name="toDate"]', String(to));
    await clickIestVisibleButtonText(page, "Update");
  } else if (args.refine_query) {
    await clickAccordionByText(page, "Refine terms");
    await page.locator('select[aria-label="Type of Search"]').first().selectOption(normalizeField(args.refine_field), { timeout: 10000 });
    await page.locator('input[aria-label="Quick search term"]').first().fill(args.refine_query, { timeout: 10000 });
    const search = page.locator('button').filter({ hasText: /^\s*Search\s*$/ }).last();
    if (!(await search.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST Refine terms Search button was not found");
    await search.click({ timeout: 10000 }).catch(async () => search.click({ timeout: 10000, force: true }));
  } else {
    await clickAccordionByText(page, "Refine by Date");
    await setIestSelectValue(page, 'select[name="fromDate"]', "2006");
    await setIestSelectValue(page, 'select[name="toDate"]', "2006");
    await clickIestVisibleButtonText(page, "Update");
  }

  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 45000) {
    const url = page.url?.() || "";
    const text = await page.locator("body").innerText({ timeout: 2500 }).catch(() => "");
    let count: number | undefined;
    try { count = parseIestResultCount(text); } catch {}
    lastEvidence = { url, count, previousUrl: before.url, previousCount: before.resultCount };
    if (count !== undefined && count <= before.resultCount && (url !== before.url || count !== before.resultCount)) return;
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IEST refine did not produce the verified URL/count change", lastEvidence);
}

export async function researchIestSearch(args: IestSearchArgs): Promise<{ result_count: number; item_count: number; items: IestItem[]; query_url: string; results_url: string; title: string }> {
  normalizeField(args.field);
  const query_url = buildIestSearchUrl(args);
  const profile = args.profile || "nuaa-iest";
  const tabId = args.tab_id || `research-iest-search-${Date.now()}`;
  const page = await withAllocatedIestPage(profile, query_url, tabId, args.cdp_port, (p) => waitForIestResults(p));
  return { result_count: page.resultCount, item_count: page.items.length, items: page.items, query_url, results_url: page.url, title: page.title };
}

export async function researchIestFilter(args: IestFilterArgs): Promise<{ result_count: number; item_count: number; items: IestItem[]; refined_url: string; confirm_title: string; unfiltered_count: number; unfiltered_url: string }> {
  const query_url = buildIestSearchUrl(args);
  const profile = args.profile || "nuaa-iest";
  const tabId = args.tab_id || `research-iest-filter-${Date.now()}`;
  return await withAllocatedIestPage(profile, query_url, tabId, args.cdp_port, async (page) => {
    const before = await waitForIestResults(page);
    await applyIestFilters(page, args, { url: before.url, resultCount: before.resultCount });
    const after = await waitForIestResults(page);
    return { result_count: after.resultCount, item_count: after.items.length, items: after.items, refined_url: after.url, confirm_title: after.title, unfiltered_count: before.resultCount, unfiltered_url: before.url };
  });
}

export async function researchIestExport(args: IestExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: IestExportFormat; article_url: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "nuaa-iest";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "iest"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const article_url = buildIestArticleUrl(args);
  const tabId = args.tab_id || `research-iest-export-${Date.now()}`;
  return await withAllocatedIestPage(profile, article_url, tabId, args.cdp_port, async (page) => {
    try {
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      await dismissIestCookieToast(page);
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      const tools = page.locator('button.chakra-popover__trigger:has-text("TOOLS"), button.chakra-popover__trigger:has-text("Tools")').first();
      await tools.waitFor({ state: "visible", timeout: 20000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST Tools popover trigger was not found", { selector: 'button.chakra-popover__trigger:has-text("TOOLS")', article_url, url: page.url?.(), cause: error?.message || String(error) }); });
      await tools.click({ timeout: 10000 }).catch(async () => tools.click({ timeout: 10000, force: true }));
      const cite = page.locator('button').filter({ hasText: /^\s*Cite\s*$/ }).first();
      await cite.waitFor({ state: "visible", timeout: 15000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST Cite button was not found after opening Tools", { cause: error?.message || String(error) }); });
      await cite.click({ timeout: 10000 }).catch(async () => cite.click({ timeout: 10000, force: true }));
      await page.locator('.chakra-modal__content, .chakra-dialog__content').filter({ hasText: /Preview\/Export Citation|citation/i }).first().waitFor({ state: "visible", timeout: 15000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEST Preview/Export Citation dialog was not found", { cause: error?.message || String(error) }); });
      const clicked = await artifactClickOnPage(page.context().browser(), page, {
        profile,
        buttonSelector: `button:has-text(".${format.toUpperCase()}")`,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        viewportWidth: 1280,
        viewportHeight: 1600,
        prerenderWaitMs: 500,
        filenamePattern: `*.${format}`
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      const valid = format === "ris" ? /^TY  - JOUR/m.test(text) && /^ER  -/m.test(text) && /DO  - 10\.17764\//m.test(text) : text.trim().length > 0;
      if (!valid) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IEST citation artifact failed content validation", { artifact_path, format });
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
      throw new WebAiToolError(code, "IEST export failed", { article_url, format, cause: error?.message || String(error) });
    }
  });
}
