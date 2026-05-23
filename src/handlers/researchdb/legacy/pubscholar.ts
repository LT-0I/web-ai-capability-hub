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

export type PubscholarField = "标题" | "关键词" | "作者" | "机构" | "摘要" | "期刊";
export type PubscholarMatchMode = "精确" | "模糊";
export type PubscholarBooleanOp = "AND" | "OR" | "NOT";
export type PubscholarExportFormat = "ris";

export interface PubscholarCondition { field?: PubscholarField | string; value: string; match_mode?: PubscholarMatchMode | string; op?: PubscholarBooleanOp | string; }
export interface PubscholarItem { title: string; authors: string[]; source: string; year: number | null; doi: string; meta: string; }
export interface PubscholarSearchArgs { query: string; keyword?: string; field?: PubscholarField | string; conditions?: PubscholarCondition[]; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface PubscholarFilterArgs extends PubscholarSearchArgs { facet_group?: string; facet_value?: string; publication_year?: number; resource_type?: string; full_text?: boolean; }
export interface PubscholarExportArgs extends PubscholarFilterArgs { format?: PubscholarExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const PUBSCHOLAR_ORIGIN = "https://pubscholar.cn";
const VALID_FIELDS = new Set(["标题", "关键词", "作者", "机构", "摘要", "期刊"]);
const VALID_MATCH_MODES = new Set(["精确", "模糊"]);
const VALID_OPS = new Set(["AND", "OR", "NOT"]);
const VALID_FORMATS = new Set(["ris"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function cleanText(value: string): string { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.\d{4,9}\/[^\s，。；;]+/i.exec(text)?.[0] || "").replace(/[),.;，。]+$/, ""); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeField(field?: string): PubscholarField {
  const out = field || "标题";
  if (!VALID_FIELDS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported PubScholar field: ${out}`, { field, valid: [...VALID_FIELDS] });
  return out as PubscholarField;
}
function normalizeMatchMode(matchMode?: string): PubscholarMatchMode {
  const out = matchMode || "模糊";
  if (!VALID_MATCH_MODES.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported PubScholar match mode: ${out}`, { match_mode: matchMode, valid: [...VALID_MATCH_MODES] });
  return out as PubscholarMatchMode;
}
function normalizeOp(op?: string): PubscholarBooleanOp {
  const out = op || "AND";
  if (!VALID_OPS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported PubScholar boolean operator: ${out}`, { op, valid: [...VALID_OPS] });
  return out as PubscholarBooleanOp;
}
function normalizeFormat(format?: string): PubscholarExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported PubScholar export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as PubscholarExportFormat;
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function buildPubscholarHomeUrl(): string { return PUBSCHOLAR_ORIGIN; }
export function buildPubscholarExploreUrl(): string { return `${PUBSCHOLAR_ORIGIN}/explore`; }

export function normalizePubscholarConditions(args: PubscholarSearchArgs): Array<Required<PubscholarCondition>> {
  const raw = args.conditions?.length
    ? args.conditions
    : args.keyword
      ? [{ field: args.field || "标题", value: args.query, match_mode: "模糊", op: "AND" }, { field: "关键词", value: args.keyword, match_mode: "模糊", op: "AND" }]
      : [{ field: args.field || "标题", value: args.query, match_mode: "模糊", op: "AND" }];
  return raw.map((condition, index) => ({
    field: normalizeField(condition.field || (index === 1 ? "关键词" : "标题")),
    value: requireQuery(condition.value),
    match_mode: normalizeMatchMode(condition.match_mode),
    op: normalizeOp(condition.op)
  }));
}

export function buildPubscholarAdvancedQueryLabel(args: PubscholarSearchArgs): string {
  const conditions = normalizePubscholarConditions(args);
  return `高级检索: ${conditions.map((condition, index) => `${index > 0 ? `${condition.op} ` : ""}${condition.field}=${condition.value}`).join(" ")}`;
}

export function parsePubscholarResultCountParts(text: string): { selected: number; total: number } {
  const normalized = String(text || "").replace(/[,，]/g, "").replace(/\s+/g, " ").trim();
  const pair = /(\d+)\s*\/\s*(\d+)\s*条/.exec(normalized);
  if (pair) return { selected: Number(pair[1]), total: Number(pair[2]) };
  const total = /(\d+)\s*条/.exec(normalized);
  if (total) return { selected: 0, total: Number(total[1]) };
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar result count node was not found", { probe: ".AppFilterMeta.MetaCounting", text });
}

export function parsePubscholarResultCount(text: string): number { return parsePubscholarResultCountParts(text).total; }

function authorsFromText(text: string): string[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const authorPart = (/作者\s*[:：]?\s*([^。；;\n]{2,180})/.exec(normalized)?.[1] || "");
  return authorPart.split(/;|；|,|，/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

export function parsePubscholarItemsFromHtml(html: string): PubscholarItem[] {
  const blocks = [...String(html || "").matchAll(/<[^>]+class=["'][^"']*List__item[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*List__item|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const title = cleanText(/<[^>]+class=["'][^"']*(?:ContentItem__title|Title|title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(block)?.[1] || /<(?:h\d|a)[^>]*>([\s\S]*?)<\/(?:h\d|a)>/i.exec(block)?.[1] || "") || text.split(/作者|中国农机化学报|DOI|关键词/i)[0].trim().slice(0, 220);
    const meta = cleanText(/<[^>]+class=["'][^"']*ContentItem__meta[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(block)?.[1] || "") || text;
    const source = (/((?:[\u4e00-\u9fa5A-Za-z& ]{2,80})(?:学报|期刊|Journal|Transactions)[^\d]{0,30})\s*(?:19\d{2}|20\d{2})?/i.exec(text)?.[1] || "").trim();
    return { title, authors: authorsFromText(text), source, year: yearFromText(text), doi: doiFromText(text), meta };
  }).filter((item) => item.title).slice(0, 100);
}

export function parsePubscholarItemsFromDomRows(rows: Array<{ text: string; title?: string; meta?: string }>): PubscholarItem[] {
  return rows.map((row) => {
    const text = String(row.text || "").replace(/\s+/g, " ").trim();
    const title = (row.title || text.split(/作者|摘要|关键词|DOI|来源/i)[0] || "").trim();
    const meta = (row.meta || text).trim();
    const source = (/((?:[\u4e00-\u9fa5A-Za-z& ]{2,80})(?:学报|期刊|Journal|Transactions)[^\d]{0,30})\s*(?:19\d{2}|20\d{2})?/i.exec(text)?.[1] || "").trim();
    return { title, authors: authorsFromText(text), source, year: yearFromText(text), doi: doiFromText(text), meta };
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

async function withAllocatedPubscholarPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "PubScholar tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function chooseBaseSelectOption(page: any, trigger: any, optionText: string): Promise<void> {
  await trigger.click({ timeout: 10000 });
  const option = page.locator("li.base-select-dropdown__item").filter({ hasText: new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`) }).last();
  await option.waitFor({ state: "visible", timeout: 10000 }).catch((error: any) => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar select option was not found", { optionText, cause: error?.message || String(error) }); });
  await option.click({ timeout: 10000 });
}

async function waitForAdvancedDialog(page: any): Promise<void> {
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 20000) {
    const evidence = await page.evaluate(() => ({
      modalCount: document.querySelectorAll(".AdvancedSearchContainer").length,
      rowCount: document.querySelectorAll(".AdvancedSearchContainer .Rows .Row").length,
      inputPlaceholders: Array.from(document.querySelectorAll(".AdvancedSearchContainer input")).map((el: any) => el.getAttribute("placeholder") || "")
    })).catch((error: any) => ({ error: error?.message || String(error) }));
    lastEvidence = evidence as Record<string, unknown>;
    if (Number((evidence as any).modalCount) > 0 && Number((evidence as any).rowCount) >= 3 && (evidence as any).inputPlaceholders?.some((v: string) => /关键词|标题/.test(v))) return;
    await sleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar advanced-search portal did not hydrate", lastEvidence);
}

async function fillAdvancedSearch(page: any, args: PubscholarSearchArgs): Promise<void> {
  const adv = page.locator("button.AdvancedSearchButton, button:has-text('高级检索')").first();
  if (!(await adv.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar advanced-search button was not found", { selector: "button.AdvancedSearchButton" });
  await adv.click({ timeout: 10000 });
  await waitForAdvancedDialog(page);

  const conditions = normalizePubscholarConditions(args).slice(0, 3);
  const rows = page.locator(".AdvancedSearchContainer .Rows .Row.base-row");
  for (let i = 0; i < conditions.length; i++) {
    const row = rows.nth(i);
    const condition = conditions[i];
    const selects = row.locator(".AdvancedSearchBarSelect");
    const opIndex = i === 0 ? -1 : 0;
    const fieldIndex = i === 0 ? 0 : 1;
    const matchIndex = i === 0 ? 1 : 2;
    if (opIndex >= 0 && await selects.nth(opIndex).count().catch(() => 0)) await chooseBaseSelectOption(page, selects.nth(opIndex), condition.op);
    if (await selects.nth(fieldIndex).count().catch(() => 0)) await chooseBaseSelectOption(page, selects.nth(fieldIndex), condition.field);
    if (await selects.nth(matchIndex).count().catch(() => 0)) await chooseBaseSelectOption(page, selects.nth(matchIndex), condition.match_mode);
    const input = row.locator(".AdvancedSearchBarInput input").first();
    if (!(await input.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar advanced-search value input was not found", { row: i });
    await input.fill(condition.value, { timeout: 10000 });
  }
}

async function waitForPubscholarResults(page: any, expectedBreadcrumb?: string): Promise<{ countText: string; breadcrumb: string; itemCount: number; url: string }> {
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  let sawCountNode = false;
  while (Date.now() - started < 45000) {
    const evidence = await page.evaluate(() => ({
      url: location.href,
      countNodePresent: Boolean(document.querySelector(".AppFilterMeta.MetaCounting")),
      countText: (document.querySelector(".AppFilterMeta.MetaCounting") as HTMLElement | null)?.innerText || "",
      breadcrumb: (document.querySelector(".AppSearchRefineItems") as HTMLElement | null)?.innerText || Array.from(document.querySelectorAll(".AppSearchRefineItem")).map((el: any) => el.innerText || el.textContent || "").join(" "),
      itemCount: document.querySelectorAll(".List .List__item").length
    })).catch((error: any) => ({ error: error?.message || String(error) }));
    lastEvidence = evidence as Record<string, unknown>;
    sawCountNode = sawCountNode || Boolean((evidence as any).countNodePresent);
    const url = String((evidence as any).url || "");
    const countText = String((evidence as any).countText || "");
    const breadcrumb = String((evidence as any).breadcrumb || "").replace(/\s+/g, " ").trim();
    const itemCount = Number((evidence as any).itemCount || 0);
    let countParts: { selected: number; total: number } | undefined;
    try { countParts = parsePubscholarResultCountParts(countText); } catch {}
    const isPubscholarPage = /^https?:\/\/(?:www\.)?pubscholar\.cn(?:\/|$)/i.test(url);
    if (isPubscholarPage && countParts && countParts.total > 0 && itemCount > 0 && (!expectedBreadcrumb || breadcrumb.includes(expectedBreadcrumb.replace(/^高级检索:\s*/, "")))) {
      return { countText, breadcrumb, itemCount, url };
    }
    await sleep(1000);
  }
  if (!sawCountNode) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar result count node was not found", { ...lastEvidence, probe: ".AppFilterMeta.MetaCounting" });
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "PubScholar results did not settle", lastEvidence);
}

async function runPubscholarSearch(page: any, args: PubscholarSearchArgs): Promise<void> {
  await fillAdvancedSearch(page, args);
  const submit = page.locator("button.AdvancedSearchSubmitButton").first();
  if (!(await submit.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar advanced-search submit button was not found", { selector: "button.AdvancedSearchSubmitButton" });
  await submit.click({ timeout: 10000 });
  await waitForPubscholarResults(page, buildPubscholarAdvancedQueryLabel(args));
}

async function readPubscholarResults(page: any): Promise<{ title: string; url: string; resultCount: number; selectedCount: number; breadcrumb: string; items: PubscholarItem[] }> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const title = await page.title().catch(() => "");
      const url = page.url?.() || "";
      const countText = await page.locator(".AppFilterMeta.MetaCounting").first().innerText({ timeout: 10000 });
      const countParts = parsePubscholarResultCountParts(countText);
      const breadcrumb = await page.locator(".AppSearchRefineItems").first().innerText({ timeout: 3000 }).catch(() => "");
      const rows = await page.locator(".List .List__item").evaluateAll((els: any[]) => els.slice(0, 100).map((el: any) => ({
        text: el.innerText || "",
        title: (el.querySelector(".ContentItem__title, .Title, h3, h2, a")?.textContent || "").trim(),
        meta: (el.querySelector(".ContentItem__meta")?.textContent || "").trim()
      }))).catch(() => []);
      const html = await page.content().catch(() => "");
      const items = parsePubscholarItemsFromDomRows(rows as Array<{ text: string; title?: string; meta?: string }>);
      return { title, url, resultCount: countParts.total, selectedCount: countParts.selected, breadcrumb, items: items.length ? items : parsePubscholarItemsFromHtml(html) };
    } catch (error) { lastError = error; await sleep(2000); }
  }
  if (lastError instanceof WebAiToolError) throw lastError;
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
}

async function applyResourceType(page: any, resourceType: string, previousCount: number): Promise<void> {
  const tab = page.locator(".AppSearchTab").filter({ hasText: new RegExp(`^\\s*${escapeRegex(resourceType)}\\s*$`) }).first();
  if (!(await tab.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar resource-type tab was not found", { resourceType });
  await tab.click({ timeout: 10000 });
  await waitForRefine(page, previousCount, "");
}

async function clickFacetOption(page: any, group: string, value: string): Promise<void> {
  const clicked = await page.evaluate(({ group, value }) => {
    const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim();
    const groups = Array.from(document.querySelectorAll(".base-collapse-item.AggregationListItem"));
    for (const groupEl of groups) {
      const header = norm((groupEl.querySelector(".base-collapse-item__headerText") as HTMLElement | null)?.innerText || "");
      if (header !== group) continue;
      const options = Array.from(groupEl.querySelectorAll(".AggregationListItem")) as HTMLElement[];
      for (const option of options) {
        if (option === groupEl) continue;
        const text = norm(option.innerText || option.textContent || "");
        if (text === value || text.startsWith(`${value} `) || text.includes(`${group}: ${value}`)) { option.click(); return { ok: true, text }; }
      }
      return { ok: false, reason: "option_not_found", header, options: options.map((el) => norm(el.innerText || el.textContent || "")).slice(0, 30) };
    }
    return { ok: false, reason: "group_not_found", groups: groups.map((el) => norm((el.querySelector(".base-collapse-item__headerText") as HTMLElement | null)?.innerText || "")).slice(0, 30) };
  }, { group, value });
  if (!(clicked as any)?.ok) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar facet option was not found", clicked as Record<string, unknown>);
}

async function waitForRefine(page: any, previousCount: number, expectedChip: string): Promise<{ countText: string; breadcrumb: string; total: number }> {
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 45000) {
    const evidence = await page.evaluate(() => ({
      countText: (document.querySelector(".AppFilterMeta.MetaCounting") as HTMLElement | null)?.innerText || "",
      breadcrumb: (document.querySelector(".AppSearchRefineItems") as HTMLElement | null)?.innerText || "",
      itemCount: document.querySelectorAll(".List .List__item").length
    })).catch((error: any) => ({ error: error?.message || String(error) }));
    lastEvidence = evidence as Record<string, unknown>;
    const countText = String((evidence as any).countText || "");
    const breadcrumb = String((evidence as any).breadcrumb || "").replace(/\s+/g, " ").trim();
    let total: number | undefined;
    try { total = parsePubscholarResultCount(countText); } catch {}
    if (total !== undefined && total <= previousCount && Number((evidence as any).itemCount || 0) > 0 && (!expectedChip || breadcrumb.includes(expectedChip))) return { countText, breadcrumb, total };
    await sleep(1000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "PubScholar refine did not produce the verified count/breadcrumb change", { ...lastEvidence, previousCount, expectedChip });
}

async function applyPubscholarFilters(page: any, args: PubscholarFilterArgs, current: { resultCount: number }): Promise<void> {
  let previousCount = current.resultCount;
  if (args.resource_type) {
    await applyResourceType(page, args.resource_type, previousCount);
    previousCount = (await readPubscholarResults(page)).resultCount;
  }
  if (args.full_text) {
    const toggle = page.locator(".AppSearchFilter.AppFilterSwitch, .AppFilterSwitch").first();
    if (!(await toggle.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar full-text toggle was not found", { selector: ".AppFilterSwitch" });
    await toggle.click({ timeout: 10000 });
    await waitForRefine(page, previousCount, "");
    previousCount = (await readPubscholarResults(page)).resultCount;
  }
  const facetGroup = args.facet_group || (args.publication_year ? "出版年" : undefined);
  const facetValue = args.facet_value || (args.publication_year ? String(args.publication_year) : undefined);
  if (facetGroup && facetValue) {
    await clickFacetOption(page, facetGroup, facetValue);
    await waitForRefine(page, previousCount, `${facetGroup}: ${facetValue}`);
  }
}

async function openFirstQuotePopover(page: any): Promise<void> {
  const quote = page.locator(".List .List__item .CircleQuoteButton__label, .CircleQuoteButton__label").first();
  if (!(await quote.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar per-record quote button was not found", { selector: ".CircleQuoteButton__label" });
  await quote.click({ timeout: 10000 });
  const started = Date.now();
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() - started < 15000) {
    const evidence = await page.evaluate(() => ({
      popperCount: document.querySelectorAll(".QuotePopper").length,
      text: (document.querySelector(".QuotePopper") as HTMLElement | null)?.innerText || ""
    })).catch((error: any) => ({ error: error?.message || String(error) }));
    lastEvidence = evidence as Record<string, unknown>;
    if (Number((evidence as any).popperCount || 0) > 0 && /RIS/.test(String((evidence as any).text || ""))) return;
    await sleep(500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar RIS quote popover did not hydrate", lastEvidence);
}

function validateRisArtifact(artifactPath: string): { structural_tags: number } {
  const text = fs.readFileSync(artifactPath, "utf-8");
  const structuralTags = (text.match(/^[A-Z0-9]{2}\s+-\s+/gm) || []).length;
  if (!/^TY\s+-\s+/m.test(text) || !/^ER\s+-/m.test(text) || !/^T1\s+-\s+/m.test(text) || structuralTags < 4) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "PubScholar RIS artifact failed content validation", { artifact_path: artifactPath, structural_tags: structuralTags });
  }
  return { structural_tags: structuralTags };
}

export async function researchPubscholarSearch(args: PubscholarSearchArgs): Promise<{ result_count: number; selected_count: number; items: PubscholarItem[]; query_url: string; results_url: string; title: string; breadcrumb: string }> {
  const profile = args.profile || "research-pubscholar";
  const tabId = args.tab_id || `research-pubscholar-search-${Date.now()}`;
  return await withAllocatedPubscholarPage(profile, buildPubscholarHomeUrl(), tabId, args.cdp_port, async (page) => {
    await runPubscholarSearch(page, args);
    const results = await readPubscholarResults(page);
    return { result_count: results.resultCount, selected_count: results.selectedCount, items: results.items, query_url: buildPubscholarAdvancedQueryLabel(args), results_url: results.url, title: results.title, breadcrumb: results.breadcrumb };
  });
}

export async function researchPubscholarFilter(args: PubscholarFilterArgs): Promise<{ result_count: number; selected_count: number; items: PubscholarItem[]; refined_url: string; confirm_title: string; breadcrumb: string; unfiltered_count: number; unfiltered_url: string }> {
  const profile = args.profile || "research-pubscholar";
  const tabId = args.tab_id || `research-pubscholar-filter-${Date.now()}`;
  return await withAllocatedPubscholarPage(profile, buildPubscholarHomeUrl(), tabId, args.cdp_port, async (page) => {
    await runPubscholarSearch(page, args);
    const before = await readPubscholarResults(page);
    await applyPubscholarFilters(page, args.publication_year === undefined && !args.facet_group && !args.facet_value && !args.resource_type && !args.full_text ? { ...args, publication_year: 2025 } : args, before);
    const after = await readPubscholarResults(page);
    return { result_count: after.resultCount, selected_count: after.selectedCount, items: after.items, refined_url: after.url, confirm_title: after.title, breadcrumb: after.breadcrumb, unfiltered_count: before.resultCount, unfiltered_url: before.url };
  });
}

export async function researchPubscholarExport(args: PubscholarExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: PubscholarExportFormat; result_count: number; results_url: string; breadcrumb: string; structural_tags: number }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-pubscholar";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "pubscholar"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-pubscholar-export-${Date.now()}`;
  return await withAllocatedPubscholarPage(profile, buildPubscholarHomeUrl(), tabId, args.cdp_port, async (page) => {
    try {
      await runPubscholarSearch(page, args);
      let results = await readPubscholarResults(page);
      if (args.publication_year || args.facet_group || args.facet_value || args.resource_type || args.full_text) {
        await applyPubscholarFilters(page, args, results);
        results = await readPubscholarResults(page);
      }
      await openFirstQuotePopover(page);
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "pubscholar.cn",
        buttonSelector: '.QuotePopper button.base-button--primary:has-text("RIS")',
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 12000,
        frameMinCount: 0,
        filenamePattern: "*.ris"
      });
      const artifact_path = clicked.path;
      const validation = validateRisArtifact(artifact_path);
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, result_count: results.resultCount, results_url: results.url, breadcrumb: results.breadcrumb, structural_tags: validation.structural_tags };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "PubScholar export failed", { format, cause: error?.message || String(error) });
    }
  });
}
