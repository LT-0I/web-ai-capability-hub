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

export type WanfangResourceType = "Thesis" | "Periodical" | "Conference" | "Patent" | string;
export type WanfangExportFormat = "txt";

export interface WanfangItem { title: string; authors: string[]; source: string; year: number | null; type: string; }
export interface WanfangSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface WanfangFilterArgs extends WanfangSearchArgs { resource_type?: WanfangResourceType; resource_label?: string; }
export interface WanfangExportArgs extends WanfangFilterArgs { format?: WanfangExportFormat; download_dir?: string; row_index?: number; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const WANFANG_ORIGIN = "https://s.wanfangdata.com.cn";
const DEFAULT_PROFILE = "research-wanfang";
const DEFAULT_CDP_PORT = 9238;
const VALID_FORMATS = new Set(["txt"]);
const RESOURCE_LABELS: Record<string, string> = {
  Thesis: "学位论文",
  Periodical: "期刊论文",
  Conference: "会议论文",
  Patent: "专利"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeFormat(format?: string): WanfangExportFormat {
  const out = (format || "txt").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Wanfang export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as WanfangExportFormat;
}
function normalizeResourceType(resourceType?: string): string { return (resourceType || "Thesis").trim() || "Thesis"; }
function resourceLabel(resourceType?: string, resource_label?: string): string { return (resource_label || RESOURCE_LABELS[normalizeResourceType(resourceType)] || normalizeResourceType(resourceType)).trim(); }
function cleanText(value: string): string { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function splitPeople(raw: string): string[] { return raw.split(/;|；|,|，|\s{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 12); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function buildWanfangSearchUrl(query: string): string {
  const url = new URL("/paper", WANFANG_ORIGIN);
  url.searchParams.set("q", requireQuery(query));
  return url.toString();
}

export function buildWanfangFacetParam(resourceType?: string, resource_label?: string): string {
  const type = normalizeResourceType(resourceType);
  return JSON.stringify([{ Type: { label: [resourceLabel(type, resource_label)], title: "资源类型", value: [type] } }]);
}

export function buildWanfangFilterUrl(args: WanfangFilterArgs): string {
  const url = new URL(buildWanfangSearchUrl(args.query));
  url.searchParams.set("p", "1");
  url.searchParams.set("facet", buildWanfangFacetParam(args.resource_type, args.resource_label));
  return url.toString();
}

export function parseWanfangResultCount(text: string): number {
  const raw = /找到\s*([\d,，]+)\s*条文献/.exec(String(text || ""))?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang result count text was not found", { probe: "找到N条文献" });
  return Number(raw.replace(/[，,]/g, ""));
}

export function parseWanfangItemsFromDomRows(rows: Array<{ text: string; title?: string; type?: string }>): WanfangItem[] {
  return rows.map((row) => {
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    const typed = /\[(期刊论文|硕士论文|博士论文|学位论文|会议论文|专利)\]/.exec(text)?.[1] || row.type || "";
    const title = (row.title || /^\d+\.\s*(?:目录)?(.+?)\s*\[(?:期刊论文|硕士论文|博士论文|学位论文|会议论文|专利)\]/.exec(text)?.[1] || text.split(/\s*\[/)[0].replace(/^\d+\.\s*/, "")).trim();
    const afterType = text.split(/\](.+)/)[1] || "";
    const year = yearFromText(text);
    const source = (/\](?:[^\d]{0,80})?(?:19\d{2}|20\d{2})\s*([^摘：要]{2,120}?)(?:\s*摘要：|\s*(?:在线阅读|下载|引用|收藏))/i.exec(text)?.[1] || "").trim();
    const authorPart = afterType.split(/\b(?:19\d{2}|20\d{2})\b/)[0] || "";
    return { title, authors: splitPeople(authorPart).slice(0, 8), source, year, type: typed };
  }).filter((item) => item.title).slice(0, 100);
}

export function parseWanfangItemsFromHtml(html: string): WanfangItem[] {
  const blocks = [...String(html || "").matchAll(/<[^>]+class=["'][^"']*normal-list[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*normal-list|$)/gi)].map((m) => m[1]);
  return parseWanfangItemsFromDomRows(blocks.map((block) => ({ text: cleanText(block), title: cleanText(/<[^>]+class=["'][^"']*(?:title|title-area)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(block)?.[1] || "") })));
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

async function withAllocatedWanfangPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Wanfang tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function trustedClick(page: any, selector: string, absentCode = ConsumerErrorCodes.ELEMENT_NOT_FOUND): Promise<void> {
  const box = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: (el.innerText || el.getAttribute("value") || "").trim() };
  }, selector).catch(() => null);
  if (!box || !box.width || !box.height) throw new WebAiToolError(absentCode, "Wanfang trusted-click target was not found", { selector });
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function trustedClickFacetLabel(page: any, label: string): Promise<void> {
  const box = await page.evaluate((wanted: string) => {
    const re = new RegExp(wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const el = Array.from(document.querySelectorAll("label.ivu-checkbox-wrapper.limitcheckbox"))
      .find((node: any) => re.test(node.innerText || node.textContent || "")) as HTMLElement | undefined;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: (el.innerText || "").trim() };
  }, label).catch(() => null);
  if (!box || !box.width || !box.height) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang facet checkbox label was not found", { selector: "label.ivu-checkbox-wrapper.limitcheckbox", label });
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + Math.min(box.width / 2, 30);
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function waitForWanfangResults(page: any, previousCount?: number, requireDelta = false): Promise<{ count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; type?: string }>; url: string; title: string; visibleText: string }> {
  let lastEvidence: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) {
    const state = await page.evaluate(() => {
      const visibleText = document.body?.innerText || "";
      const rows = Array.from(document.querySelectorAll(".normal-list")).slice(0, 100).map((el: any) => ({
        text: (el.innerText || "").trim(),
        title: (el.querySelector(".title-area .title, .title-area a, .title")?.textContent || "").trim(),
        type: /\[(期刊论文|硕士论文|博士论文|学位论文|会议论文|专利)\]/.exec(el.innerText || "")?.[1] || ""
      }));
      return { visibleText, rows, html: document.documentElement.outerHTML, url: location.href, title: document.title };
    }).catch(() => ({ visibleText: "", rows: [], html: "", url: page.url?.() || "", title: "" }));
    lastEvidence = { url: state.url, visibleText: String(state.visibleText).slice(0, 800), rows: state.rows.length };
    try {
      const count = parseWanfangResultCount(state.visibleText);
      if (!requireDelta || previousCount === undefined || count !== previousCount) return { count, countText: `找到${count}条文献`, html: state.html, rows: state.rows, url: state.url, title: state.title, visibleText: state.visibleText };
    } catch {}
    await sleep(1500);
  }
  throw new WebAiToolError(requireDelta ? ConsumerErrorCodes.MODE_UNCERTAIN : ConsumerErrorCodes.COMMAND_TIMEOUT, "Wanfang results did not reach the expected observed state", { previousCount, ...lastEvidence });
}

async function applyWanfangResourceFilter(page: any, args: WanfangFilterArgs, before: { count: number }): Promise<{ count: number; countText: string; html: string; rows: Array<{ text: string; title?: string; type?: string }>; url: string; title: string; visibleText: string }> {
  const label = resourceLabel(args.resource_type, args.resource_label);
  await trustedClickFacetLabel(page, label);
  let footerEvidence: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++) {
    const footer = await page.evaluate(() => {
      const el = document.querySelector("div.fixed-footer.fixed-follow") as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, text: (el.innerText || "").trim() };
    }).catch(() => null);
    footerEvidence = footer || {};
    if (footer && footer.width > 0) break;
    await sleep(800);
  }
  if (!Number(footerEvidence.width || 0)) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang staged facet footer did not appear", { label, footerEvidence });
  await trustedClick(page, "span.fixed-btn-submit");
  try {
    const after = await waitForWanfangResults(page, before.count, true);
    if (after.count > before.count || !/facet=/.test(after.url)) throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "Wanfang facet apply did not produce the verified count/url state", { before, after: { count: after.count, url: after.url }, label });
    return after;
  } catch (error) {
    if (error instanceof WebAiToolError && error.errorCode !== ConsumerErrorCodes.MODE_UNCERTAIN) throw error;
    await page.goto(buildWanfangFilterUrl(args), { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
    const replayed = await waitForWanfangResults(page);
    if (replayed.count > before.count || !/facet=/.test(replayed.url)) throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "Wanfang facet refine could not be verified by trusted apply or replayable facet URL", { before, replayed: { count: replayed.count, url: replayed.url }, label });
    return replayed;
  }
}

async function ensureWanfangRowSelected(page: any, rowIndex: number): Promise<void> {
  const state = await page.evaluate((index: number) => {
    const row = Array.from(document.querySelectorAll(".normal-list"))[index] as HTMLElement | undefined;
    if (!row) return { exists: false, checked: false };
    return { exists: true, checked: !!(row.querySelector(".title-area .wf-checkbox input.ivu-checkbox-input") as HTMLInputElement | null)?.checked };
  }, rowIndex).catch(() => ({ exists: false, checked: false }));
  if (!state.exists) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang result row was not found for export selection", { rowIndex, selector: ".normal-list" });
  if (state.checked) return;
  const selector = `.normal-list:nth-of-type(${rowIndex + 1}) .title-area .wf-checkbox label.ivu-checkbox-wrapper`;
  const clicked = await page.evaluate((index: number) => {
    const row = Array.from(document.querySelectorAll(".normal-list"))[index] as HTMLElement | undefined;
    const el = row?.querySelector(".title-area .wf-checkbox label.ivu-checkbox-wrapper") as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, rowIndex).catch(() => null);
  if (!clicked || !clicked.width || !clicked.height) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang row checkbox label was not found", { rowIndex, selector });
  const cdp = await page.context().newCDPSession(page);
  const x = clicked.x + clicked.width / 2;
  const y = clicked.y + clicked.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  for (let i = 0; i < 10; i++) {
    const checked = await page.evaluate((index: number) => !!((Array.from(document.querySelectorAll(".normal-list"))[index] as HTMLElement | undefined)?.querySelector(".title-area .wf-checkbox input.ivu-checkbox-input") as HTMLInputElement | null)?.checked, rowIndex).catch(() => false);
    if (checked) return;
    await sleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.MODE_UNCERTAIN, "Wanfang row checkbox did not stay selected after trusted click", { rowIndex });
}

async function openWanfangExportTab(page: any): Promise<void> {
  const context = page.context();
  const beforePages = new Set(context.pages());
  const box = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("span.export-btn")).find((node: any) => /批量引用/.test(node.innerText || node.textContent || "")) as HTMLElement | undefined;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: (el.innerText || "").trim() };
  }).catch(() => null);
  if (!box || !box.width || !box.height) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang batch citation button was not found", { selector: "span.export-btn", text: "批量引用" });
  const waitForPage = context.waitForEvent?.("page", { timeout: 15000 }).catch(() => null);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  const newPage = await waitForPage;
  if (newPage) await newPage.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  for (let i = 0; i < 20; i++) {
    const found = context.pages().find((p: any) => !beforePages.has(p) && /wanfangdata\.com\.cn\/export/.test(p.url?.() || "")) || context.pages().find((p: any) => /wanfangdata\.com\.cn\/export/.test(p.url?.() || ""));
    if (found) return;
    await sleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Wanfang batch citation did not open the export tab", { expectedUrl: "wanfangdata.com.cn/export" });
}

export async function researchWanfangSearch(args: WanfangSearchArgs): Promise<{ result_count: number; items: WanfangItem[]; query_url: string; results_url: string }> {
  const query_url = buildWanfangSearchUrl(args.query);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-wanfang-search-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  return await withAllocatedWanfangPage(profile, query_url, tabId, cdpPort, async (page) => {
    const results = await waitForWanfangResults(page);
    const items = parseWanfangItemsFromDomRows(results.rows);
    return { result_count: results.count, items: items.length ? items : parseWanfangItemsFromHtml(results.html), query_url, results_url: results.url };
  });
}

export async function researchWanfangFilter(args: WanfangFilterArgs): Promise<{ result_count: number; items: WanfangItem[]; refined_url: string; confirm_title: string; unfiltered_count: number; resource_type: string; resource_label: string }> {
  const query_url = buildWanfangSearchUrl(args.query);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-wanfang-filter-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  return await withAllocatedWanfangPage(profile, query_url, tabId, cdpPort, async (page) => {
    const before = await waitForWanfangResults(page);
    const after = await applyWanfangResourceFilter(page, args, before);
    const items = parseWanfangItemsFromDomRows(after.rows);
    return { result_count: after.count, items: items.length ? items : parseWanfangItemsFromHtml(after.html), refined_url: after.url, confirm_title: after.title, unfiltered_count: before.count, resource_type: normalizeResourceType(args.resource_type), resource_label: resourceLabel(args.resource_type, args.resource_label) };
  });
}

export async function researchWanfangExport(args: WanfangExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: WanfangExportFormat; result_count: number; results_url: string; resource_type: string; resource_label: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || DEFAULT_PROFILE;
  const tabId = args.tab_id || `research-wanfang-export-${Date.now()}`;
  const cdpPort = args.cdp_port || DEFAULT_CDP_PORT;
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "wanfang"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  return await withAllocatedWanfangPage(profile, buildWanfangSearchUrl(args.query), tabId, cdpPort, async (page) => {
    try {
      const before = await waitForWanfangResults(page);
      const filtered = await applyWanfangResourceFilter(page, args, before);
      const rowIndex = Math.max(0, Number(args.row_index || 0));
      await ensureWanfangRowSelected(page, rowIndex);
      await openWanfangExportTab(page);
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "wanfangdata.com.cn/export",
        buttonSelector: "div.option-button.adjust-button.export-text-action",
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        filenamePattern: "*.txt"
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (!/^\s*\[\d+\]/.test(text) || !/\[(?:D|J|C|P)\]/.test(text) || /<html|<!doctype/i.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Wanfang TXT citation artifact failed content validation", { artifact_path, preview: text.slice(0, 300) });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: filtered.count, results_url: filtered.url, resource_type: normalizeResourceType(args.resource_type), resource_label: resourceLabel(args.resource_type, args.resource_label) };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("MODE_UNCERTAIN") ? ConsumerErrorCodes.MODE_UNCERTAIN
        : raw.includes("PLAN_OR_QUOTA_REQUIRED") ? ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.COMMAND_TIMEOUT;
      throw new WebAiToolError(code, "Wanfang TXT export failed", { query: args.query, format, cause: error?.message || String(error) });
    }
  });
}
