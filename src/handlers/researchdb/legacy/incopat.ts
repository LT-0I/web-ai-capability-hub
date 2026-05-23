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

export type IncopatCountry = "CN" | "US" | "KR" | "WO" | "EP" | string;
export type IncopatExportFormat = "pdf";

export interface IncopatItem { title: string; publication_number: string; applicants: string[]; inventors: string[]; year: number | null; }
export interface IncopatSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface IncopatFilterArgs extends IncopatSearchArgs { country?: IncopatCountry; }
export interface IncopatExportArgs extends IncopatFilterArgs { format?: IncopatExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const INCOPAT_ORIGIN = "https://www.incopat.com";
const INCOPAT_LOGIN_URL = "https://www.incopat.com/newLogin";
const INCOPAT_SIMPLE_SEARCH_URL = "https://www.incopat.com/advancedSearch/simpleInit";
const VALID_FORMATS = new Set(["pdf"]);
const DEFAULT_PROFILE = "research-incopat";
const DEFAULT_CDP_PORT = 9239;

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeFormat(format?: string): IncopatExportFormat {
  const out = (format || "pdf").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IncoPat export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as IncopatExportFormat;
}
function normalizeCountry(country?: string): string {
  return (country || "CN").trim().toUpperCase();
}
function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function publicationNumberFromText(text: string): string { return (/\b(?:CN|US|KR|WO|EP)\s?\d+[A-Z]\d?\b/i.exec(text)?.[0] || "").replace(/\s+/g, "").toUpperCase(); }
function splitPeople(raw: string): string[] { return raw.split(/;|；|,|，|\s{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 12); }

export function buildIncopatLoginUrl(): string { return INCOPAT_LOGIN_URL; }
export function buildIncopatSearchUrl(): string { return INCOPAT_SIMPLE_SEARCH_URL; }
export function buildIncopatFacetSelector(country?: string): string { return `#PNC_TYPE_${normalizeCountry(country)} span[onclick*="singleFilter"]`; }
export function buildIncopatNormalizedQuery(query: string): string { return `ALL=(${requireQuery(query).toUpperCase()})`; }

export function parseIncopatResultCount(text: string): number {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const raw = /共\s*([\d,]+)\s*条/.exec(normalized)?.[1] || /^\s*([\d,]+)\s*$/.exec(normalized)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IncoPat result count node was not found", { probe: "#totalCount / #totalCountspan" });
  return Number(raw.replace(/,/g, ""));
}

export function parseIncopatItemsFromHtml(html: string): IncopatItem[] {
  const rows = [...String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  return rows.map((row) => {
    const text = cleanText(row);
    const publication_number = publicationNumberFromText(text) || cleanText(/<a[^>]+class=["'][^"']*(?:pdf|[^"']*pn)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(row)?.[1] || "");
    const title = cleanText(/<(?:a|span|div)[^>]+(?:class|id)=["'][^"']*(?:title|name|patent)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span|div)>/i.exec(row)?.[1] || "") || text.replace(publication_number, "").slice(0, 180).trim();
    const applicants = splitPeople(/(?:申请人|Applicant)\s*[:：]?\s*([^。;；\n]{2,180})/i.exec(text)?.[1] || "");
    const inventors = splitPeople(/(?:发明人|Inventor)\s*[:：]?\s*([^。;；\n]{2,180})/i.exec(text)?.[1] || "");
    return { title, publication_number, applicants, inventors, year: yearFromText(text) };
  }).filter((item) => item.publication_number || item.title).slice(0, 100);
}

export function parseIncopatItemsFromDomRows(rows: Array<{ text: string; title?: string; publication_number?: string }>): IncopatItem[] {
  return rows.map((row) => {
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    const publication_number = (row.publication_number || publicationNumberFromText(text)).trim();
    const title = (row.title || text.replace(publication_number, "").split(/申请人|Applicant|发明人|Inventor|公开|申请日/i)[0] || "").trim();
    return {
      title,
      publication_number,
      applicants: splitPeople(/(?:申请人|Applicant)\s*[:：]?\s*([^。;；\n]{2,180})/i.exec(text)?.[1] || ""),
      inventors: splitPeople(/(?:发明人|Inventor)\s*[:：]?\s*([^。;；\n]{2,180})/i.exec(text)?.[1] || ""),
      year: yearFromText(text)
    };
  }).filter((item) => item.publication_number || item.title).slice(0, 100);
}

function hasIncopatTemplateTokens(value: unknown): boolean {
  return /{{\s*[/#:>A-Za-z]/.test(String(value || ""));
}

function incopatRowsHaveTemplateTokens(rows: unknown): boolean {
  return Array.isArray(rows) && rows.some((row: any) => hasIncopatTemplateTokens(row?.text) || hasIncopatTemplateTokens(row?.title) || hasIncopatTemplateTokens(row?.publication_number) || hasIncopatTemplateTokens(row?.html));
}

function incopatItemsHaveTemplateTokens(items: IncopatItem[]): boolean {
  return items.some((item) => hasIncopatTemplateTokens(item.title) || hasIncopatTemplateTokens(item.publication_number) || item.applicants.some(hasIncopatTemplateTokens) || item.inventors.some(hasIncopatTemplateTokens));
}

function incopatHasPositiveResultCount(countText: unknown): boolean {
  return /^共\s*[1-9][\d,]*\s*条$/.test(String(countText || "").trim());
}

function incopatLooksUnauthenticated(state: any): boolean {
  const bodyText = String(state?.bodyText || "");
  const countText = String(state?.countText || "").trim();
  const hasHydratedCount = incopatHasPositiveResultCount(countText) || (countText !== "" && countText !== "0" && !/^共\s*0\s*条$/.test(countText));
  const hasVisibleLoginWithoutAuthSignals = Boolean(state?.hasLogin) && !/IP用户/.test(bodyText) && !hasHydratedCount && !Boolean(state?.hasSearch);
  const text = `${state?.url || ""} ${bodyText} ${String(state?.html || "").slice(0, 2000)}`;
  return hasVisibleLoginWithoutAuthSignals || /\/newLogin\b|请先?登录|重新登录|登录超时|session\s*(?:expired|timeout)|login\s+required|sign\s*in/i.test(text);
}

function incopatHasGenuineZeroState(state: any): boolean {
  const countText = String(state?.countText || "").trim();
  const rowCount = Array.isArray(state?.rows) ? state.rows.length : 0;
  return rowCount === 0 && (/^共\s*0\s*条$/.test(countText) || countText === "0");
}

function incopatHasUnhydratedTemplateState(state: any): boolean {
  return Boolean(state?.hasTemplateTokens) || incopatRowsHaveTemplateTokens(state?.rows);
}

function incopatHydrationEvidence(state: any, previousText?: string): Record<string, unknown> {
  return {
    selector: "#totalCount / #totalCountspan / div.patent_information",
    previousText,
    countText: state?.countText || "",
    url: state?.url || "",
    hasLogin: Boolean(state?.hasLogin),
    hasTemplateTokens: Boolean(state?.hasTemplateTokens) || incopatRowsHaveTemplateTokens(state?.rows),
    hasEmptyPlaceholder: Boolean(state?.hasEmptyPlaceholder),
    rowCount: Array.isArray(state?.rows) ? state.rows.length : 0,
    bodyText: String(state?.bodyText || "").slice(0, 500),
    htmlSample: String(state?.html || "").slice(0, 1000)
  };
}

function throwIncopatHydrationError(state: any, previousText?: string): never {
  const code = incopatLooksUnauthenticated(state) ? ConsumerErrorCodes.LOGIN_REQUIRED : ConsumerErrorCodes.MODE_UNCERTAIN;
  throw new WebAiToolError(code, "IncoPat results did not hydrate into real patent rows/counts", incopatHydrationEvidence(state, previousText));
}

function assertHydratedIncopatResults(results: { countText: string; html: string; rows: Array<{ text: string; title?: string; publication_number?: string }>; url: string }, items: IncopatItem[]): void {
  const state = {
    ...results,
    hasTemplateTokens: incopatRowsHaveTemplateTokens(results.rows)
  };
  if (incopatHasGenuineZeroState(state)) return;
  if (incopatHasUnhydratedTemplateState(state) || incopatItemsHaveTemplateTokens(items)) throwIncopatHydrationError({ ...state, hasEmptyPlaceholder: incopatHasGenuineZeroState(state) });
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

async function withAllocatedIncopatPage<T>(profile: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, INCOPAT_LOGIN_URL, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IncoPat tab allocation/navigation failed", { url: INCOPAT_LOGIN_URL, cause: error instanceof Error ? error.message : String(error) });
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

async function trustedClick(page: any, selector: string, absentCode = ConsumerErrorCodes.ELEMENT_NOT_FOUND): Promise<void> {
  const box = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: (el.innerText || el.getAttribute("value") || "").trim() };
  }, selector).catch(() => null);
  if (!box || !box.width || !box.height) throw new WebAiToolError(absentCode, "IncoPat trusted-click target was not found", { selector });
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function ensureLoggedIn(page: any): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const state = await page.evaluate(() => ({
      url: location.href,
      hasLogin: (() => { const e = document.querySelector("#ipLoginBtn") as HTMLElement | null; if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !!e.offsetParent; })(),
      hasSearch: !!document.querySelector("#searchValue"),
      userText: (document.body?.innerText || "").slice(0, 2000)
    })).catch(() => ({ url: page.url?.() || "", hasLogin: false, hasSearch: false, userText: "" }));
    if (state.hasSearch || /IP用户/.test(state.userText) || /advancedSearch\/simpleInit/.test(state.url)) return;
    if (state.hasLogin) break;
    await sleep(1000);
  }
  const hasLogin = await page.evaluate(() => { const e = document.querySelector("#ipLoginBtn") as HTMLElement | null; if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !!e.offsetParent; }).catch(() => false);
  if (!hasLogin) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IncoPat IP-login button was absent", { selector: "#ipLoginBtn", url: page.url?.() || "" });
  await trustedClick(page, "#ipLoginBtn", ConsumerErrorCodes.ELEMENT_NOT_FOUND);
  let lastState: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    const state = await page.evaluate(() => ({ url: location.href, hasSearch: !!document.querySelector("#searchValue"), userText: (document.body?.innerText || "").slice(0, 2000), cookies: document.cookie.includes("JSESSIONID") || document.cookie.includes("SESSION") })).catch(() => ({ url: page.url?.() || "", hasSearch: false, userText: "", cookies: false }));
    lastState = state;
    if (!/\/newLogin/.test(String(state.url)) && (state.hasSearch || /IP用户/.test(String(state.userText)) || /advancedSearch\/simpleInit/.test(String(state.url)))) return;
  }
  throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "IncoPat trusted IP-login did not reach the authenticated app", lastState);
}

async function ensureSearchPage(page: any): Promise<void> {
  await ensureLoggedIn(page);
  const state = await page.evaluate(() => ({ url: location.href, hasSearch: !!document.querySelector("#searchValue") })).catch(() => ({ url: page.url?.() || "", hasSearch: false }));
  if (!state.hasSearch || !/advancedSearch\/simpleInit/.test(String(state.url))) {
    await page.goto(INCOPAT_SIMPLE_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
  }
  for (let i = 0; i < 10; i++) {
    const hasSearch = await page.evaluate(() => !!document.querySelector("#searchValue")).catch(() => false);
    if (hasSearch) return;
    await sleep(1000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IncoPat simple-search input was not found", { selector: "#searchValue", url: page.url?.() || "" });
}

async function waitForCount(page: any, previousText?: string, requireDelta = false): Promise<{ count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; publication_number?: string }>; url: string; breadcrumb: string }> {
  let lastEvidence: Record<string, unknown> = {};
  let settledZero: { count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; publication_number?: string }>; url: string; breadcrumb: string } | undefined;
  for (let i = 0; i < 16; i++) {
    const state = await page.evaluate(() => {
      const countText = ((document.querySelector("#totalCount") as HTMLElement | null)?.innerText || (document.querySelector("#totalCountspan") as HTMLElement | null)?.innerText || "").trim();
      const html = document.documentElement.outerHTML;
      const rows = Array.from(document.querySelectorAll("div.patent_information")).slice(0, 100).map((el: any) => ({
        text: (el.innerText || "").trim(),
        title: (el.querySelector(".title")?.textContent || "").trim(),
        publication_number: (el.querySelector("span.tit-name1")?.textContent || "").trim(),
        html: String(el.outerHTML || "").slice(0, 4000)
      }));
      const breadcrumb = Array.from(document.querySelectorAll("body *")).map((el: any) => el.innerText || "").find((t: string) => /已筛选/.test(t)) || "";
      return {
        countText,
        rows,
        html,
        url: location.href,
        breadcrumb: String(breadcrumb).slice(0, 500),
        bodyText: (document.body?.innerText || "").slice(0, 2000),
        hasLogin: (() => { const e = document.querySelector("#ipLoginBtn") as HTMLElement | null; if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !!e.offsetParent; })(),
        hasSearch: !!document.querySelector("#searchValue"),
        hasTemplateTokens: rows.some((row: any) => /{{\s*[/#:>A-Za-z]/.test(`${row.text} ${row.title} ${row.publication_number} ${row.html}`)),
        hasEmptyPlaceholder: rows.length === 0 && /^共\s*0\s*条$/.test(countText)
      };
    }).catch(() => ({ countText: "", rows: [], html: "", url: page.url?.() || "", breadcrumb: "" }));
    lastEvidence = incopatHydrationEvidence(state, previousText);
    if (incopatLooksUnauthenticated(state)) throwIncopatHydrationError(state, previousText);
    try {
      const count = parseIncopatResultCount(state.countText);
      const hasRequiredTransition = !requireDelta || state.countText !== previousText;
      if (incopatHasPositiveResultCount(state.countText) && !state.hasLogin && hasRequiredTransition) return { count, countText: state.countText, html: state.html, rows: state.rows, url: state.url, breadcrumb: state.breadcrumb };
      if (!incopatHasUnhydratedTemplateState(state) && hasRequiredTransition) {
        const hydrated = { count, countText: state.countText, html: state.html, rows: state.rows, url: state.url, breadcrumb: state.breadcrumb };
        if (count === 0) settledZero = hydrated;
        else return hydrated;
      } else {
        settledZero = undefined;
      }
    } catch {
      settledZero = undefined;
    }
    if (incopatHasUnhydratedTemplateState(state)) {
      await sleep(2000);
      continue;
    }
    await sleep(2000);
  }
  if (settledZero) return settledZero;
  throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "IncoPat result count did not reach a hydrated observed state", { previousText, ...lastEvidence });
}

async function runIncopatSearch(page: any, query: string): Promise<{ count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; publication_number?: string }>; url: string; breadcrumb: string }> {
  await ensureSearchPage(page);
  const beforeText = await page.evaluate(() => ((document.querySelector("#totalCount") as HTMLElement | null)?.innerText || "").trim()).catch(() => "");
  await page.evaluate((q: string) => {
    const input = document.querySelector("#searchValue") as HTMLInputElement | null;
    if (!input) return false;
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, requireQuery(query));
  await page.keyboard.press("Enter");
  return await waitForCount(page, beforeText, false);
}

async function applyIncopatCountryFilter(page: any, country: string, previous: { count: number; countText: string }): Promise<{ count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; publication_number?: string }>; url: string; breadcrumb: string }> {
  const selector = buildIncopatFacetSelector(country);
  const exists = await page.evaluate((sel: string) => !!document.querySelector(sel), selector).catch(() => false);
  if (!exists) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IncoPat country facet singleFilter span was not found", { selector });
  await trustedClick(page, selector);
  const after = await waitForCount(page, previous.countText, true);
  if (after.count > previous.count) throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "IncoPat country refine increased the observed result count", { before: previous, after, selector });
  return after;
}

async function readQuotaText(page: any): Promise<string> {
  return await page.evaluate(() => ((document.querySelector("#downloadHistoryTipDiv") as HTMLElement | null)?.innerText || "").trim()).catch(() => "");
}

export async function researchIncopatSearch(args: IncopatSearchArgs): Promise<{ result_count: number; items: IncopatItem[]; query_url: string; results_url: string; normalized_query: string }> {
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-incopat-search-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  return await withAllocatedIncopatPage(profile, tabId, cdpPort, async (page) => {
    const results = await runIncopatSearch(page, requireQuery(args.query));
    const items = parseIncopatItemsFromDomRows(results.rows);
    const parsedItems = items.length ? items : results.count === 0 ? [] : parseIncopatItemsFromHtml(results.html);
    assertHydratedIncopatResults(results, parsedItems);
    return { result_count: results.count, items: parsedItems, query_url: buildIncopatSearchUrl(), results_url: results.url, normalized_query: buildIncopatNormalizedQuery(args.query) };
  });
}

export async function researchIncopatFilter(args: IncopatFilterArgs): Promise<{ result_count: number; items: IncopatItem[]; refined_url: string; confirm_title: string; unfiltered_count: number; country: string; breadcrumb: string }> {
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-incopat-filter-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  return await withAllocatedIncopatPage(profile, tabId, cdpPort, async (page) => {
    const before = await runIncopatSearch(page, requireQuery(args.query));
    const country = normalizeCountry(args.country);
    const after = await applyIncopatCountryFilter(page, country, before);
    const items = parseIncopatItemsFromDomRows(after.rows);
    const title = await page.title().catch(() => "");
    const parsedItems = items.length ? items : after.count === 0 ? [] : parseIncopatItemsFromHtml(after.html);
    assertHydratedIncopatResults(after, parsedItems);
    return { result_count: after.count, items: parsedItems, refined_url: after.url, confirm_title: title, unfiltered_count: before.count, country, breadcrumb: after.breadcrumb };
  });
}

export async function researchIncopatExport(args: IncopatExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: IncopatExportFormat; result_count: number; results_url: string; country?: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-incopat-export-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "incopat"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  return await withAllocatedIncopatPage(profile, tabId, cdpPort, async (page) => {
    try {
      let results = await runIncopatSearch(page, requireQuery(args.query));
      let country: string | undefined;
      if (args.country) {
        country = normalizeCountry(args.country);
        results = await applyIncopatCountryFilter(page, country, results);
      }
      const pdfCount = await page.evaluate(() => document.querySelectorAll("a.pdf").length).catch(() => 0);
      if (!pdfCount) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IncoPat per-row PDF export link was not found", { selector: "a.pdf" });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "incopat.com",
        buttonSelector: "a.pdf",
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        filenamePattern: "*.pdf"
      });
      const artifact_path = clicked.path;
      const head = fs.readFileSync(artifact_path).subarray(0, 8).toString("utf-8");
      if (!head.startsWith("%PDF-")) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IncoPat PDF artifact failed content validation", { artifact_path, head });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: results.count, results_url: results.url, country };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const quotaText = await readQuotaText(page);
      if (/超过\s*20|下载数量超过|下载的数量超过|本周下载历史/.test(quotaText)) throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "IncoPat export quota wall was displayed", { quotaText });
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("PLAN_OR_QUOTA_REQUIRED") ? ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED
        : raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw) ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "IncoPat PDF export failed", { query: args.query, country: args.country, cause: error?.message || String(error), quotaText });
    }
  });
}
