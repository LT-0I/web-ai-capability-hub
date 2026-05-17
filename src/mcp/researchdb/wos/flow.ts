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

export type WosSearchMode = "advanced";
export type WosDocumentType = "Article";
export type WosExportFormat = "bibtex" | "ris" | "tab" | "plain" | "excel" | "endnote";

export interface WosItem { title: string; authors: string[]; source: string; year: number | null; doi: string; }
export interface WosSearchArgs { query: string; mode?: WosSearchMode | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface WosFilterArgs extends WosSearchArgs { document_type?: WosDocumentType | string; }
export interface WosExportArgs { query: string; document_type?: WosDocumentType | string; format?: WosExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const WOS_ORIGIN = "https://www.webofscience.com";
const ADVANCED_PATH = "/wos/woscc/advanced-search";
const WOS_RUN_SEARCH_SELECTOR = 'button[data-ta="run-search"]';
const WOS_CONSENT_OVERLAY_SELECTORS = ["#onetrust-banner-sdk", "#onetrust-consent-sdk", ".ot-sdk-container"];
const WOS_CONSENT_CONTROL_SELECTORS = ["#onetrust-accept-btn-handler", "#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler"];
const VALID_FORMATS = new Set(["bibtex", "ris", "tab", "plain", "excel", "endnote"]);
const FORMAT_SELECTORS: Record<WosExportFormat, string> = {
  bibtex: "#exportToBibtexButton",
  ris: "#exportToRisButton",
  tab: "#exportToTabWinButton",
  plain: "#exportToFieldTaggedButton",
  excel: "#exportToExcelButton",
  endnote: "#exportToEnwDesktopButton"
};
const FORMAT_PATTERNS: Partial<Record<WosExportFormat, string>> = { bibtex: "*.bib", ris: "*.ris", tab: "*.txt", plain: "*.txt", excel: "*.xls", endnote: "*.enw" };

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
function normalizeDocumentType(documentType?: string): WosDocumentType {
  const out = documentType || "Article";
  if (out !== "Article") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Web of Science document_type: ${out}`, { document_type: documentType, valid: ["Article"] });
  return out as WosDocumentType;
}
function normalizeFormat(format?: string): WosExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Web of Science export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as WosExportFormat;
}

export function buildWosAdvancedSearchUrl(args: { query?: string; page_size?: number } = {}): string {
  const url = new URL(ADVANCED_PATH, WOS_ORIGIN);
  const query = args.query?.trim();
  if (query) url.searchParams.set("query", query);
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function parseWosResultCount(text: string): number {
  const input = String(text || "");
  const direct = /([\d,]+)\s+results from Web of Science/i.exec(input);
  const title = /\s[–-]\s([\d,]+)\s[–-]\sWeb of Science Core Collection/i.exec(input);
  const raw = direct?.[1] || title?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Web of Science result count node was not found", { probe: "N results from Web of Science" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.\d{4,9}\/[^\s<]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] { return text.split(/;|,\s+(?=[A-Z][A-Za-z-]+,)| and /).map((s) => s.trim()).filter((s) => s && !/^(By:|Authors?:|Source:|Published:|Document Type:)/i.test(s)).slice(0, 20); }

export function parseWosItemsFromHtml(html: string): WosItem[] {
  const blocks = [...String(html || "").matchAll(/<app-summary-record[\s\S]*?<\/app-summary-record>|<div[^>]+class=["'][^"']*(?:summary-record|search-results-item|record)[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*(?:summary-record|search-results-item|record)|<app-summary-record|$)/gi)].map((m) => m[0]);
  const candidates = blocks.length ? blocks : [...String(html || "").matchAll(/<h3[\s\S]*?<\/h3>[\s\S]{0,1800}?(?=<h3|$)/gi)].map((m) => m[0]);
  return candidates.map((block) => {
    const title = cleanText(/<(?:h3|a)[^>]*(?:data-ta=["']summary-record-title["'][^>]*)?>([\s\S]*?)<\/(?:h3|a)>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/wos\/woscc\/full-record[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "");
    const text = cleanText(block);
    const doi = doiFromText(text);
    const year = yearFromText(text);
    const source = cleanText(/(?:Source|Published in):?\s*([^.;|]{3,160})/i.exec(text)?.[1] || /<span[^>]+class=["'][^"']*source[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] || "");
    const authorPart = (/By:\s*([\s\S]*?)(?:Source|Published|Document Type|DOI|\b(?:19\d{2}|20\d{2})\b)/i.exec(text)?.[1] || "").trim();
    return { title: title || text.slice(0, 160), authors: authorsFromText(authorPart), source, year, doi };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseWosItemsFromVisibleText(text: string): WosItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Sort by:/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=\d+\.\s+)/).filter((piece) => /^\d+\./.test(piece)).slice(0, 100);
  return pieces.map((piece) => {
    const body = piece.replace(/^\d+\.\s*/, "");
    const title = body.split(/\s+By:\s+|\s+Authors?:\s+/i)[0].trim();
    const authorPart = (/\b(?:By|Authors?):\s*([\s\S]*?)(?:\s+Source:|\s+Published:|\s+Document Type:|\s+DOI:|\s+\b(?:19\d{2}|20\d{2})\b)/i.exec(body)?.[1] || "").trim();
    const source = (/\bSource:\s*([\s\S]*?)(?:\s+Published:|\s+Document Type:|\s+DOI:|$)/i.exec(body)?.[1] || "").trim();
    return { title, authors: authorsFromText(authorPart), source, year: yearFromText(body), doi: doiFromText(body) };
  }).filter((item) => item.title || item.doi);
}

async function readWosConsentEvidence(page: any): Promise<Record<string, unknown>> {
  return await page.evaluate(({ overlays, controls }: { overlays: string[]; controls: string[] }) => {
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    };
    const overlay = overlays.map((selector) => ({ selector, el: document.querySelector(selector) as HTMLElement | null })).find((entry) => visible(entry.el));
    return {
      consentOverlayPresent: Boolean(overlay),
      consentOverlaySelector: overlay?.selector || "",
      consentOverlayText: (overlay?.el?.innerText || "").slice(0, 1000),
      consentControlsPresent: controls.filter((selector) => visible(document.querySelector(selector)))
    };
  }, { overlays: WOS_CONSENT_OVERLAY_SELECTORS, controls: WOS_CONSENT_CONTROL_SELECTORS }).catch((error: any) => ({ cause: error?.message || String(error) }));
}

async function dismissWosConsentIfPresent(page: any): Promise<boolean> {
  for (const selector of WOS_CONSENT_CONTROL_SELECTORS) {
    const control = page.locator(selector).first();
    if (!(await control.count().catch(() => 0))) continue;
    if (await control.click({ timeout: 3000 }).then(() => true).catch(() => false)) {
      await sleep(1000);
      return true;
    }
  }
  return false;
}

async function throwWosClickFailure(page: any, selector: string, description: string, error: any, consentDismissed: boolean): Promise<never> {
  const targetCount = await page.locator(selector).count().catch(() => 0);
  const consent = await readWosConsentEvidence(page);
  const code = targetCount ? ConsumerErrorCodes.COMMAND_TIMEOUT : ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  throw new WebAiToolError(code, `${description} was blocked or unavailable`, { selector, targetCount, consentDismissed, ...consent, cause: error?.message || String(error) });
}

async function clickWosControl(page: any, selector: string, description: string, options: Record<string, unknown> = {}): Promise<void> {
  let consentDismissed = await dismissWosConsentIfPresent(page);
  const target = page.locator(selector).first();
  if (!(await target.count().catch(() => 0))) {
    const consent = await readWosConsentEvidence(page);
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `${description} was not found`, { selector, consentDismissed, ...consent });
  }
  try {
    await target.click({ timeout: 10000, ...options });
  } catch (error: any) {
    consentDismissed = (await dismissWosConsentIfPresent(page)) || consentDismissed;
    try {
      await target.click({ timeout: 10000, ...options });
    } catch (retryError: any) {
      await throwWosClickFailure(page, selector, description, retryError || error, consentDismissed);
    }
  }
}

async function waitForWosAdvancedPage(page: any): Promise<void> {
  let lastText = "";
  for (let i = 0; i < 8; i++) {
    lastText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    const title = await page.title().catch(() => "");
    if (lastText.includes("Add to query") && lastText.includes("Field Tag") && /Advanced search - Web of Science Core Collection/i.test(title)) return;
    await sleep(4000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Web of Science advanced-search page did not hydrate", { visibleText: lastText.slice(0, 500) });
}

async function readWosResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: WosItem[]; url: string }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      const url = page.url?.() || "";
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      if (/login|captcha/i.test(title + " " + visibleText)) throw new WebAiToolError(ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, "Web of Science requires human access intervention", { title, url });
      const resultCount = parseWosResultCount(`${title} ${visibleText}`);
      const items = parseWosItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseWosItemsFromVisibleText(visibleText), url };
      if (/\/wos\/woscc\/summary\//.test(url) && resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(4000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Web of Science results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedWosPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Web of Science tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function runWosSearch(page: any, query: string): Promise<{ resultCount: number; items: WosItem[]; queryUrl: string; title: string }> {
  await waitForWosAdvancedPage(page);
  await dismissWosConsentIfPresent(page);
  await page.locator('button[data-ta="clear-search"]').click({ timeout: 3000 }).catch(() => undefined);
  await page.locator("#advancedSearchInputArea").fill(requireQuery(query), { timeout: 10000 });
  const value = await page.locator("#advancedSearchInputArea").inputValue({ timeout: 5000 }).catch(() => "");
  if (!value.includes(query.slice(0, Math.min(20, query.length)))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Web of Science query did not land in advanced search input", { query, value });
  await clickWosControl(page, WOS_RUN_SEARCH_SELECTOR, "Web of Science run-search button");
  const settled = await readWosResultsPage(page);
  return { resultCount: settled.resultCount, items: settled.items, queryUrl: settled.url, title: settled.title };
}

async function applyWosArticleFilter(page: any): Promise<{ resultCount: number; items: WosItem[]; refinedUrl: string; confirmTitle: string; activeRefine: string }> {
  normalizeDocumentType("Article");
  let beforeUrl = page.url?.() || "";
  await dismissWosConsentIfPresent(page);
  const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const match = /Article\.\s*([\d,]+)/i.exec(text);
  const selector = match ? `input[aria-label^="Article. ${match[1]}"]` : 'input[aria-label^="Article. "]';
  await clickWosControl(page, selector, "Web of Science Article refine checkbox");
  await clickWosControl(page, 'xpath=(//button[@data-ta="refine-submit"])[3]', "Web of Science refine-submit button", { force: true });
  for (let i = 0; i < 8; i++) {
    const url = page.url?.() || "";
    const body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    if (url !== beforeUrl && body.includes("Article (Document Types)")) break;
    await sleep(4000);
  }
  const settled = await readWosResultsPage(page);
  const activeRefine = settled.visibleText.includes("Article (Document Types)") ? "Article (Document Types)" : "";
  if (!activeRefine) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Web of Science Article refine chip was not found", { selector });
  return { resultCount: settled.resultCount, items: settled.items, refinedUrl: settled.url, confirmTitle: settled.title, activeRefine };
}

export async function researchWosSearch(args: WosSearchArgs): Promise<{ result_count: number; items: WosItem[]; query_url: string }> {
  const query = requireQuery(args.query);
  asPositiveInt(args.page_size, "page_size");
  const profile = args.profile || "research-wos";
  const tabId = args.tab_id || `research-wos-search-${Date.now()}`;
  const page = await withAllocatedWosPage(profile, buildWosAdvancedSearchUrl(), tabId, args.cdp_port, (p) => runWosSearch(p, query));
  return { result_count: page.resultCount, items: page.items, query_url: page.queryUrl };
}

export async function researchWosFilter(args: WosFilterArgs): Promise<{ result_count: number; items: WosItem[]; refined_url: string; confirm_title: string; active_refine: string }> {
  const query = requireQuery(args.query);
  normalizeDocumentType(args.document_type);
  asPositiveInt(args.page_size, "page_size");
  const profile = args.profile || "research-wos";
  const tabId = args.tab_id || `research-wos-filter-${Date.now()}`;
  return await withAllocatedWosPage(profile, buildWosAdvancedSearchUrl(), tabId, args.cdp_port, async (p) => {
    await runWosSearch(p, query);
    const refined = await applyWosArticleFilter(p);
    return { result_count: refined.resultCount, items: refined.items, refined_url: refined.refinedUrl, confirm_title: refined.confirmTitle, active_refine: refined.activeRefine };
  });
}

export async function researchWosExport(args: WosExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: WosExportFormat; result_count: number }> {
  const query = requireQuery(args.query);
  const format = normalizeFormat(args.format);
  normalizeDocumentType(args.document_type);
  const profile = args.profile || "research-wos";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "wos"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-wos-export-${Date.now()}`;
  return await withAllocatedWosPage(profile, buildWosAdvancedSearchUrl(), tabId, args.cdp_port, async (page) => {
    try {
      await runWosSearch(page, query);
      const refined = await applyWosArticleFilter(page);
      await page.locator("#export-trigger-btn").click({ timeout: 10000, force: true });
      await page.locator(FORMAT_SELECTORS[format]).click({ timeout: 10000, force: true });
      for (let i = 0; i < 6; i++) {
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        if (/Export Records to/i.test(text) && /Export/i.test(text)) break;
        await sleep(2000);
      }
      const clicked = await runArtifactClick({ profile, tabUrlContains: "webofscience.com", buttonSelector: "#exportButton", downloadDir, timeoutMs: 60000, locateTimeoutMs: 30000, frameMinCount: 0, filenamePattern: FORMAT_PATTERNS[format] });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!/@(?:article|inproceedings|book|misc)\{/i.test(text) || !/title\s*=\s*[{\"]/i.test(text))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Web of Science BibTeX artifact failed content validation", { artifact_path });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: refined.resultCount };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "Web of Science export failed", { query, format, cause: error?.message || String(error) });
    }
  });
}
