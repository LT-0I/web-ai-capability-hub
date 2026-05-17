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

export type CrcExportFormat = "csv";
export type CrcAccessFacet = "access" | "licensed" | "open_access" | "free_to_view" | "forthcoming" | "fully_oa_books" | "books_with_oa_chapters";

export interface CrcItem { title: string; authors: string[]; doi: string; content_type: string; year: number | null; href: string; }
export interface CrcSearchArgs { query?: string; title?: string; author?: string; keyword?: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface CrcFilterArgs extends CrcSearchArgs { access_facet?: CrcAccessFacet; open_access?: boolean; free_to_view?: boolean; access_content?: boolean; licensed_content?: boolean; include_forthcoming?: boolean; fully_oa_books?: boolean; books_with_oa_chapters?: boolean; year_from?: number; year_to?: number; }
export interface CrcExportArgs extends CrcFilterArgs { format?: CrcExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const CRC_ORIGIN = "https://www.taylorfrancis.com";
const CRC_ADVANCED_URL = `${CRC_ORIGIN}/search/advance-search?context=ubx`;
const VALID_FORMATS = new Set(["csv"]);
const ACCESS_SELECTOR: Record<CrcAccessFacet, string> = {
  access: "#mat-checkbox-1-input",
  forthcoming: "#mat-checkbox-2-input",
  licensed: "#mat-checkbox-3-input",
  open_access: "#mat-checkbox-4-input",
  free_to_view: "#mat-checkbox-5-input",
  fully_oa_books: "#mat-checkbox-6-input",
  books_with_oa_chapters: "#mat-checkbox-7-input"
};
const EXPECTED_CSV_COLUMNS = [
  "Master ISBN", "DOI Link", "Title", "Subtitle", "Edition", "Author", "Subject Level 1", "Subject Level 2", "Subject Level 3", "Subject Level 4", "Series Name", "First Published", "Copyright Year", "Imprint", "Is Open Access?", "Hardback ISBN", "Paperback ISBN", "eBook Status", "DRM Status", "Excluded Regions", "Publisher Group", "Author affiliation", "Is Entitled"
];

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function cleanText(value: string): string { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function requireSearchTerms(args: CrcSearchArgs): { title?: string; author?: string; keyword?: string } {
  const title = (args.title || "").trim();
  const author = (args.author || "").trim();
  const keyword = (args.keyword || args.query || "").trim();
  if (!title && !author && !keyword) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query, title, author, or keyword is required");
  return { title: title || undefined, author: author || undefined, keyword: keyword || undefined };
}
function asYear(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1000 || n > 3000) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a four-digit year`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): CrcExportFormat {
  const out = (format || "csv").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported CRC/T&F eBooks export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as CrcExportFormat;
}
function doiFromText(text: string): string { return (/10\.1201\/[A-Za-z0-9._/-]+/i.exec(text)?.[0] || /10\.4324\/[A-Za-z0-9._/-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function authorsFromText(text: string): string[] {
  const match = /\bby\s+(.+?)(?:\s+(?:Book|Chapter|eBook|Published|Copyright|First Published|DOI|10\.\d{4})\b|$)/i.exec(text);
  return String(match?.[1] || "").split(/,|;| and /i).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
function csvRowCount(text: string): number {
  const source = String(text || "");
  if (!source.trim()) return 0;
  let rows = 1; let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { if (inQuotes && source[i + 1] === '"') i++; else inQuotes = !inQuotes; }
    else if ((c === "\n" || c === "\r") && !inQuotes) {
      const isCrLf = c === "\r" && source[i + 1] === "\n";
      const nextIndex = i + (isCrLf ? 2 : 1);
      if (source.slice(nextIndex).trim()) rows++;
      if (isCrLf) i++;
    }
  }
  return rows;
}
function parseCsvFirstRow(text: string): string[] {
  const row: string[] = []; let cur = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes; }
    else if (c === "," && !inQuotes) { row.push(cur); cur = ""; }
    else if ((c === "\n" || c === "\r") && !inQuotes) { row.push(cur); return row.map((s) => s.trim()); }
    else cur += c;
  }
  row.push(cur);
  return row.map((s) => s.trim());
}
function validateCrcCsv(filePath: string): { columns: number; rows: number; header: string[] } {
  const text = fs.readFileSync(filePath, "utf-8");
  const header = parseCsvFirstRow(text);
  const rows = Math.max(0, csvRowCount(text) - 1);
  const columnsOk = header.length === 23 && EXPECTED_CSV_COLUMNS.every((name, i) => header[i] === name);
  const contentOk = /10\.(1201|4324)\//i.test(text) && /machine learning/i.test(text);
  if (!columnsOk || rows < 1 || !contentOk) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "CRC/T&F eBooks CSV artifact failed content validation", { filePath, columns: header.length, rows, contentOk });
  return { columns: header.length, rows, header };
}

export function buildCrcAdvancedSearchUrl(): string { return CRC_ADVANCED_URL; }
export function buildCrcSearchUrl(args: CrcSearchArgs): string {
  const terms = requireSearchTerms(args);
  const url = new URL("/search", CRC_ORIGIN);
  if (terms.title) url.searchParams.set("advanceTitle", terms.title);
  if (terms.author) url.searchParams.set("advanceAuthor", terms.author);
  if (terms.keyword) url.searchParams.set("advanceKeywords", terms.keyword);
  return url.toString();
}
export function parseCrcResultCount(text: string): number {
  const raw = /Showing\s+([\d,]+)\s+results/i.exec(text || "")?.[1] || /([\d,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks result count node was not found", { probe: "Showing N results" });
  return Number(raw.replace(/,/g, ""));
}
export function parseCrcItemsFromHtml(html: string): CrcItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<a[^>]+class=["'][^"']*search-flex-container[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const href = /href=["']([^"']+)["']/i.exec(block)?.[1] || "";
    const title = cleanText(/<(?:h\d|span|div)[^>]+class=["'][^"']*(?:title|search-result-title|heading)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h\d|span|div)>/i.exec(block)?.[1] || "") || text.split(/\s+by\s+|\s+10\.\d{4}\//i)[0].trim().slice(0, 220);
    const type = /\b(Book|Chapter|eBook)\b/i.exec(text)?.[1] || "";
    return { title, authors: authorsFromText(text), doi: doiFromText(text), content_type: type, year: yearFromText(text), href };
  }).filter((item) => item.title || item.doi || item.href).slice(0, 100);
}
export function parseCrcItemsFromVisibleText(text: string): CrcItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Showing\s+[\d,]+\s+results/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=(?:Book|Chapter)\s+)/i).slice(0, 40);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const title = beforeDoi.replace(/^(Book|Chapter)\s+/i, "").split(/\s+by\s+/i)[0].trim();
    return { title, authors: authorsFromText(beforeDoi), doi, content_type: (/^(Book|Chapter)/i.exec(piece)?.[1] || ""), year: yearFromText(beforeDoi), href: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
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
async function withAllocatedCrcPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try { await allocateResearchSession(profile, url, tabId, cdpPort); }
  catch (error) { throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "CRC/T&F eBooks tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) }); }
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

async function readCrcResults(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: CrcItem[]; url: string }> {
  let stable: any; let lastCount = -1; let lastError: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseCrcResultCount(visibleText);
      const items = parseCrcItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseCrcItemsFromVisibleText(visibleText), url: page.url?.() || "" };
      if (resultCount === lastCount || i >= 2) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(2500);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}
async function clickMaterialCheckbox(page: any, inputSelector: string): Promise<void> {
  const found = await page.locator(inputSelector).count().catch(() => 0);
  if (!found) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks filter checkbox was not found", { selector: inputSelector });
  await page.evaluate((selector: string) => {
    const input = document.querySelector(selector) as HTMLInputElement | null;
    const host = input?.closest("mat-checkbox") || input?.closest("label") || input?.parentElement;
    const label = host?.querySelector("label.mat-checkbox-layout") || document.querySelector(`label[for="${input?.id}"]`) || host;
    const target = (label?.querySelector(".mat-checkbox-inner-container") || label) as HTMLElement | null;
    if (!target) throw new Error(`visible checkbox target not found for ${selector}`);
    const rect = target.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    target.dispatchEvent(new PointerEvent("pointerdown", opts));
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    target.dispatchEvent(new PointerEvent("pointerup", opts));
    target.dispatchEvent(new MouseEvent("mouseup", opts));
    target.dispatchEvent(new MouseEvent("click", opts));
  }, inputSelector).catch(async () => {
    await page.locator(inputSelector).evaluate((input: any) => (input.closest("mat-checkbox")?.querySelector("label.mat-checkbox-layout") || input).click());
  });
}
async function fillAngularNumber(page: any, selector: string, value: number): Promise<void> {
  const input = page.locator(selector).first();
  const exists = await input.count().catch(() => 0);
  if (!exists) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks publication-year input was not found", { selector });
  await input.focus({ timeout: 10000 });
  await input.evaluate((element: HTMLInputElement) => element.select());
  await page.keyboard.press("Backspace");
  await input.pressSequentially(String(value), { delay: 20 });
  await input.evaluate((element: HTMLInputElement) => element.blur());
}
async function waitForAngularNumberValue(page: any, selector: string, value: number): Promise<void> {
  const expected = String(value);
  await page.waitForFunction(
    ({ selector, expected }: { selector: string; expected: string }) => (document.querySelector(selector) as HTMLInputElement | null)?.value === expected,
    { selector, expected },
    { timeout: 5000 }
  ).catch(() => {});
}
async function waitForCountDelta(page: any, before: number): Promise<{ after: number; text: string }> {
  const started = Date.now(); let lastText = ""; let lastCount = before;
  while (Date.now() - started < 45000) {
    lastText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => lastText);
    try { lastCount = parseCrcResultCount(lastText); if (lastCount <= before && lastCount !== before) return { after: lastCount, text: lastText }; } catch {}
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks refine did not produce a result-count delta", { before, lastCount });
}
async function expandCrcPublicationRangePanel(page: any): Promise<void> {
  await page.evaluate(() => {
    const apply = document.querySelector("button.applyPublicationRange") as HTMLElement | null;
    if (!apply) return;
    const findToggle = (root: Element): HTMLElement | null => {
      if (root.getAttribute("aria-expanded") === "false") return root as HTMLElement;
      const collapsed = root.querySelector(
        [
          '[aria-expanded="false"]',
          ".mat-expansion-panel-header:not([aria-expanded='true'])",
          ".accordion-button.collapsed",
          "button.collapsed",
          "[data-toggle='collapse'][aria-expanded='false']",
          "[data-bs-toggle='collapse'][aria-expanded='false']"
        ].join(",")
      ) as HTMLElement | null;
      if (collapsed && !collapsed.contains(apply)) return collapsed;
      if (root.classList.contains("mat-expansion-panel") && !root.classList.contains("mat-expanded")) {
        return root.querySelector(".mat-expansion-panel-header, [role='button'], button") as HTMLElement | null;
      }
      if ((root.classList.contains("accordion-item") || root.classList.contains("accordion")) && root.querySelector(".collapse:not(.show), .collapsed")) {
        return root.querySelector(".accordion-button, [aria-controls], [data-toggle='collapse'], [data-bs-toggle='collapse'], [role='button'], button") as HTMLElement | null;
      }
      return null;
    };
    for (let node: Element | null = apply.parentElement; node && node !== document.body; node = node.parentElement) {
      const toggle = findToggle(node);
      if (toggle) {
        toggle.click();
        return;
      }
    }
  }).catch(() => undefined);
}
async function applyCrcFilters(page: any, args: CrcFilterArgs, before: { resultCount: number }): Promise<void> {
  const facet = args.access_facet || (args.open_access ? "open_access" : args.free_to_view ? "free_to_view" : args.access_content ? "access" : args.licensed_content ? "licensed" : args.include_forthcoming ? "forthcoming" : args.fully_oa_books ? "fully_oa_books" : args.books_with_oa_chapters ? "books_with_oa_chapters" : undefined);
  const yearFrom = asYear(args.year_from, "year_from");
  const yearTo = asYear(args.year_to, "year_to");
  if (facet) await clickMaterialCheckbox(page, ACCESS_SELECTOR[facet]);
  if (yearFrom !== undefined) await fillAngularNumber(page, "#Choose", yearFrom);
  if (yearTo !== undefined) await fillAngularNumber(page, "#ChooseYear", yearTo);
  if (yearFrom !== undefined || yearTo !== undefined) {
    if (yearFrom !== undefined) await waitForAngularNumberValue(page, "#Choose", yearFrom);
    if (yearTo !== undefined) await waitForAngularNumberValue(page, "#ChooseYear", yearTo);
    const apply = page.locator("button.applyPublicationRange").first();
    if (!(await apply.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks year-range apply button was not found", { selector: "button.applyPublicationRange" });
    await expandCrcPublicationRangePanel(page);
    await sleep(300);
    await (async () => {
      await apply.scrollIntoViewIfNeeded({ timeout: 10000 });
      await apply.waitFor({ state: "visible", timeout: 10000 });
      await apply.click({ timeout: 10000 });
    })().catch((error: any) => {
      throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks year-range apply button was not clickable", { selector: "button.applyPublicationRange", cause: error?.message || String(error) });
    });
  }
  if (!facet && yearFrom === undefined && yearTo === undefined) await clickMaterialCheckbox(page, ACCESS_SELECTOR.open_access);
  await waitForCountDelta(page, before.resultCount);
}

export async function researchCrcSearch(args: CrcSearchArgs): Promise<{ result_count: number; items: CrcItem[]; query_url: string; results_url: string; title: string }> {
  const query_url = buildCrcSearchUrl(args);
  const profile = args.profile || "research-crc";
  const tabId = args.tab_id || `research-crc-search-${Date.now()}`;
  const page = await withAllocatedCrcPage(profile, query_url, tabId, args.cdp_port, (p) => readCrcResults(p));
  return { result_count: page.resultCount, items: page.items, query_url, results_url: page.url, title: page.title };
}
export async function researchCrcFilter(args: CrcFilterArgs): Promise<{ result_count: number; items: CrcItem[]; refined_url: string; confirm_title: string; unfiltered_count: number; unfiltered_url: string }> {
  const query_url = buildCrcSearchUrl(args);
  const profile = args.profile || "research-crc";
  const tabId = args.tab_id || `research-crc-filter-${Date.now()}`;
  return await withAllocatedCrcPage(profile, query_url, tabId, args.cdp_port, async (page) => {
    const before = await readCrcResults(page);
    await applyCrcFilters(page, args, before);
    const after = await readCrcResults(page);
    if (after.resultCount > before.resultCount) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "CRC/T&F eBooks refine increased the result count", { before: before.resultCount, after: after.resultCount });
    return { result_count: after.resultCount, items: after.items, refined_url: after.url, confirm_title: after.title, unfiltered_count: before.resultCount, unfiltered_url: before.url };
  });
}
export async function researchCrcExport(args: CrcExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: CrcExportFormat; result_count: number; results_url: string; columns: number; rows: number }> {
  const format = normalizeFormat(args.format);
  const query_url = buildCrcSearchUrl(args);
  const profile = args.profile || "research-crc";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "crc"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-crc-export-${Date.now()}`;
  return await withAllocatedCrcPage(profile, query_url, tabId, args.cdp_port, async (page) => {
    try {
      let results = await readCrcResults(page);
      if (args.access_facet || args.open_access || args.free_to_view || args.access_content || args.licensed_content || args.include_forthcoming || args.fully_oa_books || args.books_with_oa_chapters || args.year_from || args.year_to) {
        await applyCrcFilters(page, args, results);
        results = await readCrcResults(page);
      }
      const exportButton = page.locator("button.export-search-button").first();
      if (!(await exportButton.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks export-search button was not found", { selector: "button.export-search-button" });
      await exportButton.click({ timeout: 10000 });
      await page.locator('div[role="dialog"][aria-labelledby="modalName"]').first().waitFor({ state: "visible", timeout: 30000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "CRC/T&F eBooks export modal was not found", { selector: 'div[role="dialog"][aria-labelledby="modalName"]', cause: error?.message || String(error) }); });
      const clicked = await runArtifactClick({ profile, tabUrlContains: "taylorfrancis.com/search", buttonSelector: 'div[role="dialog"] button.btn-primary.btn', downloadDir, filenamePattern: "*.csv", timeoutMs: 90000, locateTimeoutMs: 30000, frameMinCount: 0 });
      const artifact_path = clicked.path;
      const validation = validateCrcCsv(artifact_path);
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: results.resultCount, results_url: results.url, columns: validation.columns, rows: validation.rows };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "CRC/T&F eBooks export failed", { format, cause: error?.message || String(error) });
    }
  });
}
