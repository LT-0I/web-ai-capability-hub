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

export type ProquestExportFormat = "ris";
export type ProquestLimit = "fulltext" | "peerreviewed";

export interface ProquestItem { title: string; authors: string[]; source: string; year: number | null; accession_number: string; }
export interface ProquestSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface ProquestFilterArgs extends ProquestSearchArgs { full_text?: boolean; peer_reviewed?: boolean; }
export interface ProquestExportArgs extends ProquestFilterArgs { format?: ProquestExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const PROQUEST_ORIGIN = "https://www.proquest.com";
const PROQUEST_ADVANCED_URL = "https://www.proquest.com/advanced?accountid=16605";
const VALID_FORMATS = new Set(["ris"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeFormat(format?: string): ProquestExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ProQuest export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as ProquestExportFormat;
}
function cleanText(value: string): string { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function accessionFromText(text: string): string { return (/\b(?:AN|Accession Number)\s*[:：]?\s*(\d{6,})\b/i.exec(text)?.[1] || /\b(\d{9,})\b/.exec(text)?.[1] || ""); }
function authorsFromText(text: string): string[] {
  const authorPart = (/作者\s*[:：]?\s*([^。\n]+)|Author(?:s)?\s*[:：]?\s*([^.;\n]+)/i.exec(text)?.[1] || /作者\s*[:：]?\s*([^。\n]+)|Author(?:s)?\s*[:：]?\s*([^.;\n]+)/i.exec(text)?.[2] || "");
  return authorPart.split(/;|,|；|，| and /).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

export function buildProquestAdvancedSearchUrl(): string { return PROQUEST_ADVANCED_URL; }

export function buildProquestInlineNoftQuery(query: string): string {
  const trimmed = requireQuery(query);
  return /\b(?:noft|ti|ab|su)\s*\(/i.test(trimmed) ? trimmed : `noft(${trimmed})`;
}

export function parseProquestResultCount(text: string): number {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const match = /([\d,]+)\s*(?:个)?\s*检索结果|检索结果\s*[:：]?\s*([\d,]+)|([\d,]+)\s*results?/i.exec(normalized);
  const raw = match?.[1] || match?.[2] || match?.[3];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest result count node was not found", { probe: "div.resultsHeaderBarItem" });
  return Number(raw.replace(/,/g, ""));
}

export function parseProquestItemsFromHtml(html: string): ProquestItem[] {
  const blocks = [...String(html || "").matchAll(/<li[^>]+class=["'][^"']*resultItem[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*resultItem|<\/ol>|<\/ul>|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const title = cleanText(/<(?:h\d|a)[^>]+(?:class=["'][^"']*(?:truncatedResultsTitle|resultTitle|title)[^"']*["'][^>]*)?[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "") || text.split(/作者|Author|Source|出版|Published/i)[0].trim().slice(0, 220);
    const source = (/\b(?:Source|来源)\s*[:：]?\s*([^.;。\n]{2,160})/i.exec(text)?.[1] || "").trim();
    return { title, authors: authorsFromText(text), source, year: yearFromText(text), accession_number: accessionFromText(text) };
  }).filter((item) => item.title).slice(0, 100);
}

export function parseProquestItemsFromDomRows(rows: Array<{ text: string; title?: string }>): ProquestItem[] {
  return rows.map((row) => {
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    return { title: (row.title || text.split(/作者|Author|Source|出版|Published/i)[0] || "").trim(), authors: authorsFromText(text), source: (/\b(?:Source|来源)\s*[:：]?\s*([^.;。\n]{2,160})/i.exec(text)?.[1] || "").trim(), year: yearFromText(text), accession_number: accessionFromText(text) };
  }).filter((item) => item.title).slice(0, 100);
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

async function withAllocatedProquestPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function dismissProquestOverlays(page: any): Promise<void> {
  for (const selector of ["#onetrust-accept-btn-handler", "._pendo-close-guide"]) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) await locator.click({ timeout: 3000 }).catch(() => undefined);
  }
}

async function hasVisibleProquestBackdrop(page: any): Promise<boolean> {
  return await page.locator("div.modal-backdrop").evaluateAll((els: any[]) => els.some((el: any) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
  })).catch(() => false);
}

async function dismissProquestRestoreSessionModal(page: any, clickSelector: string): Promise<void> {
  const dialog = page.locator("#restoresession_confirm").first();
  const dialogPresent = Boolean(await dialog.count().catch(() => 0));
  const dialogVisible = dialogPresent && await dialog.isVisible({ timeout: 1000 }).catch(() => false);
  const backdropVisible = await hasVisibleProquestBackdrop(page);
  if (!dialogVisible && !backdropVisible) return;

  if (dialogVisible) {
    const controls = [
      '#restoresession_confirm button:has-text("Start new session")',
      '#restoresession_confirm a:has-text("Start new session")',
      '#restoresession_confirm button:has-text("New session")',
      '#restoresession_confirm a:has-text("New session")',
      '#restoresession_confirm button:has-text("start a new")',
      '#restoresession_confirm a:has-text("start a new")',
      '#restoresession_confirm button:has-text("Close")',
      '#restoresession_confirm a:has-text("Close")',
      '#restoresession_confirm button:has-text("Dismiss")',
      '#restoresession_confirm a:has-text("Dismiss")',
      '#restoresession_confirm button:has-text("继续")',
      '#restoresession_confirm a:has-text("继续")',
      '#restoresession_confirm button:has-text("新会话")',
      '#restoresession_confirm a:has-text("新会话")',
      '#restoresession_confirm button:has-text("关闭")',
      '#restoresession_confirm a:has-text("关闭")',
      '#restoresession_confirm [data-dismiss="modal"]',
      '#restoresession_confirm button.close',
      '#restoresession_confirm .close',
      '#restoresession_confirm .modal-footer button',
      '#restoresession_confirm .modal-footer a',
      '#restoresession_confirm button',
      '#restoresession_confirm a'
    ];
    let dismissed = false;
    let lastCause = "";
    for (const selector of controls) {
      const control = page.locator(selector).first();
      if (!(await control.count().catch(() => 0))) continue;
      try {
        await control.click({ timeout: 5000 });
        dismissed = true;
        break;
      } catch (error: any) {
        lastCause = error?.message || String(error);
      }
    }
    if (!dismissed) {
      const blocker = await readProquestBlockingLayer(page, clickSelector);
      throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest restore-session dialog could not be dismissed before search", { selector: clickSelector, dialogSelector: "#restoresession_confirm", ...blocker, cause: lastCause });
    }
  }

  await page.locator("div.modal-backdrop").first().waitFor({ state: "hidden", timeout: 7000 }).catch(async (error: any) => {
    const blocker = await readProquestBlockingLayer(page, clickSelector);
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest restore-session backdrop did not clear before search", { selector: clickSelector, dialogSelector: "#restoresession_confirm", ...blocker, cause: error?.message || String(error) });
  });

  if (await hasVisibleProquestBackdrop(page)) {
    const blocker = await readProquestBlockingLayer(page, clickSelector);
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest restore-session backdrop still blocks search", { selector: clickSelector, dialogSelector: "#restoresession_confirm", ...blocker });
  }
}

async function readProquestBlockingLayer(page: any, selector: string): Promise<Record<string, unknown>> {
  return await page.evaluate((sel: string) => {
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    };
    const target = document.querySelector(sel) as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const top = rect ? document.elementFromPoint(Math.min(Math.max(rect.left + rect.width / 2, 0), Math.max(window.innerWidth - 1, 0)), Math.min(Math.max(rect.top + rect.height / 2, 0), Math.max(window.innerHeight - 1, 0))) as HTMLElement | null : null;
    const candidates = Array.from(document.querySelectorAll('[role="dialog"], .modal, .modal-backdrop, .ui-dialog, [class*="modal"], [id*="modal"], [class*="session"], [id*="session"]')).filter(visible) as HTMLElement[];
    const overlay = candidates.find((el) => /restore|session|login|sign|auth|modal/i.test(`${el.id} ${el.className} ${el.innerText}`)) || candidates[0] || null;
    return {
      selector: sel,
      targetPresent: Boolean(target),
      targetVisible: visible(target),
      topElement: top ? { tag: top.tagName, id: top.id || "", className: String(top.className || "").slice(0, 200), text: (top.innerText || "").slice(0, 300) } : null,
      overlayText: (overlay?.innerText || "").slice(0, 1000),
      overlayId: overlay?.id || "",
      overlayClass: overlay ? String(overlay.className || "").slice(0, 200) : "",
      bodyText: (document.body?.innerText || "").slice(0, 1500)
    };
  }, selector).catch((error: any) => ({ selector, cause: error?.message || String(error) }));
}

function classifyProquestBlockingLayer(evidence: Record<string, unknown>): string {
  const focusedText = `${evidence.overlayText || ""} ${evidence.overlayId || ""} ${evidence.overlayClass || ""} ${JSON.stringify(evidence.topElement || "")}`;
  const bodyText = String(evidence.bodyText || "");
  if (/restore|session|logged\s*out|sign\s*in|login|authenticat|重新登录|登录超时|请先?登录/i.test(focusedText) || /restore.{0,80}session|session.{0,80}(?:expired|timeout|restore)/i.test(bodyText)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/captcha|verify\s+you|human|access\s+denied|blocked/i.test(`${focusedText} ${bodyText}`)) return ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
  return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
}

async function waitForResults(page: any, previousUrl?: string): Promise<void> {
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 45000) {
    const url = page.url?.() || "";
    const countText = await page.locator("div.resultsHeaderBarItem").first().innerText({ timeout: 1500 }).catch(() => "");
    lastEvidence = { url, countText };
    if (/\/results\/[^/]+PQ\/1\?accountid=16605/.test(url) && (!previousUrl || url !== previousUrl) && /[\d,]+/.test(countText)) return;
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest results page did not settle", lastEvidence);
}

type ProquestResults = { title: string; url: string; resultCount: number; items: ProquestItem[]; appliedFacets: Record<string, boolean> };

async function isProquestCheckboxChecked(page: any, selector: string): Promise<boolean> {
  const checkbox = page.locator(selector).first();
  if (!(await checkbox.count().catch(() => 0))) return false;
  return Boolean(await checkbox.isChecked({ timeout: 1000 }).catch(async () => {
    const checked = await checkbox.getAttribute("checked").catch(() => null);
    const ariaChecked = await checkbox.getAttribute("aria-checked").catch(() => null);
    return checked !== null || ariaChecked === "true";
  }));
}

async function readProquestFacetState(page: any, facetSelectors: string[] = []): Promise<Record<string, boolean>> {
  const appliedFacets: Record<string, boolean> = {};
  for (const selector of facetSelectors) appliedFacets[selector] = await isProquestCheckboxChecked(page, selector);
  return appliedFacets;
}

async function readProquestResultsOnce(page: any, facetSelectors: string[] = []): Promise<ProquestResults> {
  const title = await page.title().catch(() => "");
  const url = page.url?.() || "";
  const countText = await page.locator("div.resultsHeaderBarItem").first().innerText({ timeout: 10000 });
  const resultCount = parseProquestResultCount(countText);
  const rows = await page.locator("li.resultItem").evaluateAll((els: any[]) => els.slice(0, 100).map((el: any) => ({ text: el.innerText || "", title: (el.querySelector("a.resultTitle, .truncatedResultsTitle a, h3 a, h2 a")?.textContent || "").trim() }))).catch(() => []);
  const html = await page.content().catch(() => "");
  const items = parseProquestItemsFromDomRows(rows as Array<{ text: string; title?: string }>);
  return { title, url, resultCount, items: items.length ? items : parseProquestItemsFromHtml(html), appliedFacets: await readProquestFacetState(page, facetSelectors) };
}

async function readProquestResults(page: any, facetSelectors: string[] = []): Promise<ProquestResults> {
  const started = Date.now();
  let lastError: unknown;
  let lastResult: ProquestResults | undefined;
  while (Date.now() - started < 45000) {
    try {
      const result = await readProquestResultsOnce(page, facetSelectors);
      if (lastResult?.resultCount === result.resultCount) return result;
      lastResult = result;
    } catch (error) {
      lastError = error;
    }
    await sleep(1500);
  }
  if (lastError instanceof WebAiToolError) throw lastError;
  if (lastResult) throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest results count did not settle across two reads", { url: lastResult.url, resultCount: lastResult.resultCount, appliedFacets: lastResult.appliedFacets });
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
}

async function runProquestSearch(page: any, query: string): Promise<void> {
  await dismissProquestOverlays(page);
  await dismissProquestRestoreSessionModal(page, "#queryTermField");
  const field = page.locator("#queryTermField").first();
  if (!(await field.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest base boolean query field was not found", { selector: "#queryTermField" });
  await field.fill(buildProquestInlineNoftQuery(query), { timeout: 10000 }).catch(async (error: any) => {
    const blocker = await readProquestBlockingLayer(page, "#queryTermField");
    const code = classifyProquestBlockingLayer(blocker);
    const message = code === ConsumerErrorCodes.ELEMENT_NOT_FOUND ? "ProQuest base boolean query field was not fillable" : "ProQuest session/auth overlay blocked query field";
    throw new WebAiToolError(code, message, { selector: "#queryTermField", ...blocker, cause: error?.message || String(error) });
  });
  const submit = page.locator("#searchToResultPage").first();
  if (!(await submit.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest search submit was not found", { selector: "#searchToResultPage" });
  await dismissProquestRestoreSessionModal(page, "#searchToResultPage");
  await submit.click({ timeout: 10000 }).catch(async (error: any) => {
    const blocker = await readProquestBlockingLayer(page, "#searchToResultPage");
    const code = classifyProquestBlockingLayer(blocker);
    const message = code === ConsumerErrorCodes.ELEMENT_NOT_FOUND ? "ProQuest search submit was not clickable" : "ProQuest session/auth overlay blocked search submit";
    throw new WebAiToolError(code, message, { selector: "#searchToResultPage", ...blocker, cause: error?.message || String(error) });
  });
  await waitForResults(page);
  await dismissProquestOverlays(page);
}

function proquestFilterSelectors(args: ProquestFilterArgs): string[] {
  const selectors: string[] = [];
  if (args.full_text) selectors.push("#filterCheckbox_fulltext");
  if (args.peer_reviewed) selectors.push("#filterCheckbox_peerreviewed");
  return selectors;
}

async function applyProquestFilters(page: any, args: ProquestFilterArgs, current: ProquestResults): Promise<void> {
  const filters: Array<[boolean | undefined, string]> = [[args.full_text, "#filterCheckbox_fulltext"], [args.peer_reviewed, "#filterCheckbox_peerreviewed"]];
  for (const [enabled, selector] of filters) {
    if (!enabled) continue;
    const checkbox = page.locator(selector).first();
    if (!(await checkbox.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest refine checkbox was not found", { selector });
    const previousCount = current.resultCount;
    const alreadyAppliedAtBaseline = Boolean(current.appliedFacets[selector]) || await isProquestCheckboxChecked(page, selector);
    if (alreadyAppliedAtBaseline) continue;
    await checkbox.click({ timeout: 10000 }).catch(async (error: any) => {
      const blocker = await readProquestBlockingLayer(page, selector);
      const code = classifyProquestBlockingLayer(blocker);
      const message = code === ConsumerErrorCodes.ELEMENT_NOT_FOUND ? "ProQuest refine checkbox was not clickable" : "ProQuest session/auth overlay blocked refine checkbox";
      throw new WebAiToolError(code, message, { selector, ...blocker, cause: error?.message || String(error) });
    });
    const started = Date.now();
    let lastEvidence: Record<string, unknown> = {};
    let lastAcceptedCount: number | undefined;
    while (Date.now() - started < 45000) {
      const url = page.url?.() || "";
      const countText = await page.locator("div.resultsHeaderBarItem").first().innerText({ timeout: 1500 }).catch(() => "");
      let count: number | undefined;
      try { count = parseProquestResultCount(countText); } catch {}
      const checked = await isProquestCheckboxChecked(page, selector);
      const decremented = count !== undefined && count < previousCount;
      const alreadyAppliedStable = alreadyAppliedAtBaseline && checked && count === previousCount;
      const accepted = decremented || alreadyAppliedStable;
      lastEvidence = { url, countText, count, previousUrl: current.url, previousCount, urlChanged: url !== current.url, checked, alreadyAppliedAtBaseline, lastAcceptedCount };
      if (accepted && count === lastAcceptedCount) return;
      lastAcceptedCount = accepted ? count : undefined;
      await sleep(1500);
    }
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ProQuest refine did not produce the verified settled count decrement", lastEvidence);
  }
}

async function waitForProquestSaveToolbarEnabled(save: any, timeoutMs = 15000): Promise<{ enabled: boolean; className: string }> {
  const started = Date.now();
  let className = "";
  while (Date.now() - started < timeoutMs) {
    className = await save.getAttribute("class").catch(() => "") || "";
    if (!/\bdisabled\b/.test(className)) return { enabled: true, className };
    await sleep(500);
  }
  className = await save.getAttribute("class").catch(() => "") || className;
  return { enabled: !/\bdisabled\b/.test(className), className };
}

export async function researchProquestSearch(args: ProquestSearchArgs): Promise<{ result_count: number; items: ProquestItem[]; query_url: string; results_url: string; title: string }> {
  const profile = args.profile || "research-proquest";
  const tabId = args.tab_id || `research-proquest-search-${Date.now()}`;
  return await withAllocatedProquestPage(profile, buildProquestAdvancedSearchUrl(), tabId, args.cdp_port, async (page) => {
    await runProquestSearch(page, requireQuery(args.query));
    const results = await readProquestResults(page);
    return { result_count: results.resultCount, items: results.items, query_url: buildProquestAdvancedSearchUrl(), results_url: results.url, title: results.title };
  });
}

export async function researchProquestFilter(args: ProquestFilterArgs): Promise<{ result_count: number; items: ProquestItem[]; refined_url: string; confirm_title: string; unfiltered_count: number; unfiltered_url: string }> {
  const profile = args.profile || "research-proquest";
  const tabId = args.tab_id || `research-proquest-filter-${Date.now()}`;
  return await withAllocatedProquestPage(profile, buildProquestAdvancedSearchUrl(), tabId, args.cdp_port, async (page) => {
    await runProquestSearch(page, requireQuery(args.query));
    const filterArgs = args.full_text === undefined && args.peer_reviewed === undefined ? { ...args, full_text: true } : args;
    const before = await readProquestResults(page, proquestFilterSelectors(filterArgs));
    await applyProquestFilters(page, filterArgs, before);
    const after = await readProquestResults(page);
    return { result_count: after.resultCount, items: after.items, refined_url: after.url, confirm_title: after.title, unfiltered_count: before.resultCount, unfiltered_url: before.url };
  });
}

export async function researchProquestExport(args: ProquestExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: ProquestExportFormat; result_count: number; results_url: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-proquest";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "proquest"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-proquest-export-${Date.now()}`;
  return await withAllocatedProquestPage(profile, buildProquestAdvancedSearchUrl(), tabId, args.cdp_port, async (page) => {
    try {
      await runProquestSearch(page, requireQuery(args.query));
      let results = await readProquestResults(page, proquestFilterSelectors(args));
      if (args.full_text || args.peer_reviewed) {
        await applyProquestFilters(page, args, results);
        results = await readProquestResults(page, proquestFilterSelectors(args));
      }
      await dismissProquestOverlays(page);
      const firstCheckbox = page.locator("#mlcb1").first();
      if (!(await firstCheckbox.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest first-result checkbox was not found", { selector: "#mlcb1" });
      await firstCheckbox.click({ timeout: 10000 });
      await dismissProquestOverlays(page);
      const save = page.locator("#allSaveOptionsLink").first();
      if (!(await save.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest save/export menu was not found", { selector: "#allSaveOptionsLink" });
      const firstEnable = await waitForProquestSaveToolbarEnabled(save);
      if (!firstEnable.enabled) {
        const allCheckbox = page.locator("#mlcbAll").first();
        if (!(await allCheckbox.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest selected-item toolbar did not enable after selecting a result", { selector: "#mlcb1" });
        await allCheckbox.click({ timeout: 10000 });
      }
      const finalEnable = firstEnable.enabled ? firstEnable : await waitForProquestSaveToolbarEnabled(save);
      if (!finalEnable.enabled) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest selected-item toolbar stayed disabled", { selector: "#allSaveOptionsLink", className: finalEnable.className });
      await save.click({ timeout: 10000 });
      await page.locator('a.saveExportLink[href*="ProEndRefMgr"]').first().waitFor({ state: "visible", timeout: 15000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest RIS export link was not found", { selector: 'a.saveExportLink[href*="ProEndRefMgr"]', cause: error?.message || String(error) }); });
      await runArtifactClick({ profile, tabUrlContains: "proquest.com", buttonSelector: 'a.saveExportLink[href*="ProEndRefMgr"]', downloadDir, timeoutMs: 20000, locateTimeoutMs: 20000, frameMinCount: 0 }).catch(() => undefined);
      await page.locator('div[id^="continueButtons_saveasfile"] a.btn.btn-default').first().waitFor({ state: "visible", timeout: 20000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ProQuest export Continue button was not found", { selector: 'div[id^="continueButtons_saveasfile"] a.btn.btn-default', cause: error?.message || String(error) }); });
      const clicked = await runArtifactClick({ profile, tabUrlContains: "proquest.com", buttonSelector: 'div[id^="continueButtons_saveasfile"] a.btn.btn-default', downloadDir, timeoutMs: 60000, locateTimeoutMs: 20000, frameMinCount: 0, filenamePattern: "*.ris" });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !/^AN  - /m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ProQuest RIS artifact failed content validation", { artifact_path });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: results.resultCount, results_url: results.url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "ProQuest export failed", { format, cause: error?.message || String(error) });
    }
  });
}
