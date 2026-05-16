const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type InspirehepExportFormat = "bibtex" | "latex-eu" | "latex-us" | "json" | "cv";
export type InspirehepFacet = "doc_type" | "author_count" | "rpp" | "author" | "subject" | "arxiv_categories" | "collaboration";

export interface InspirehepItem { control_number: string; title: string; authors: string[]; year: number | null; url: string; arxiv_eprint: string; citations: number | null; }
export interface InspirehepSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface InspirehepFilterArgs extends InspirehepSearchArgs { doc_type?: string; author_count?: string; rpp?: string; author?: string; subject?: string; arxiv_category?: string; collaboration?: string; earliest_date?: string; facet?: InspirehepFacet | string; facet_value?: string; }
export interface InspirehepExportArgs { control_number?: string | number; query?: string; doc_type?: string; size?: number; format?: InspirehepExportFormat | string; filename?: string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const INSPIREHEP_ORIGIN = "https://inspirehep.net";
const VALID_FORMATS = new Set(["bibtex", "latex-eu", "latex-us", "json", "cv"]);
const VALID_FACETS = new Set(["doc_type", "author_count", "rpp", "author", "subject", "arxiv_categories", "collaboration"]);

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
    .replace(/\s+/g, " ")
    .trim();
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query?: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "INSPIRE-HEP structured query is required");
  return query.trim();
}
function normalizeFormat(format?: string): InspirehepExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported INSPIRE-HEP export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as InspirehepExportFormat;
}
function requireControlNumber(value?: string | number): string {
  const out = String(value || "").trim().replace(/^https?:\/\/inspirehep\.net\/literature\//i, "");
  if (!/^\d+$/.test(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "INSPIRE-HEP control_number is required for per-record export", { control_number: value });
  return out;
}
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "inspirehep"; }
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
function addOptional(url: URL, key: string, value: unknown): void {
  if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function authorsFromText(text: string): string[] { return String(text || "").split(/,| and |•/).map((s) => s.replace(/\([^)]*\)/g, "").trim()).filter(Boolean).slice(0, 20); }
function extensionForFormat(format: InspirehepExportFormat): string { return format === "json" ? "json" : format === "cv" ? "html" : format.startsWith("latex") ? "tex" : "bib"; }

export function buildInspirehepSearchUrl(args: InspirehepSearchArgs): string {
  const url = new URL("/literature", INSPIREHEP_ORIGIN);
  url.searchParams.set("sort", "mostrecent");
  url.searchParams.set("size", String(asPositiveInt(args.page_size, "page_size") || 25));
  url.searchParams.set("page", "1");
  url.searchParams.set("q", requireQuery(args.query));
  return url.toString();
}

export function buildInspirehepFilterUrl(args: InspirehepFilterArgs): string {
  const url = new URL(buildInspirehepSearchUrl(args));
  addOptional(url, "doc_type", args.doc_type);
  addOptional(url, "author_count", args.author_count);
  addOptional(url, "rpp", args.rpp);
  addOptional(url, "author", args.author);
  addOptional(url, "subject", args.subject);
  addOptional(url, "arxiv_categories", args.arxiv_category);
  addOptional(url, "collaboration", args.collaboration);
  addOptional(url, "earliest_date", args.earliest_date);
  if (args.facet || args.facet_value) {
    const facet = String(args.facet || "");
    if (!VALID_FACETS.has(facet)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported INSPIRE-HEP facet: ${facet}`, { facet, valid: [...VALID_FACETS] });
    if (!args.facet_value) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "facet_value is required when facet is set", { facet });
    url.searchParams.set(facet, args.facet_value);
  }
  return url.toString();
}

export function buildInspirehepRecordExportUrl(controlNumber: string | number, format: InspirehepExportFormat | string = "bibtex"): string {
  const fmt = normalizeFormat(format);
  const url = new URL(`/api/literature/${requireControlNumber(controlNumber)}`, INSPIREHEP_ORIGIN);
  url.searchParams.set("format", fmt);
  return url.toString();
}

export function buildInspirehepResultsetExportUrl(args: InspirehepExportArgs): string {
  const fmt = normalizeFormat(args.format);
  const url = new URL("/api/literature", INSPIREHEP_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  addOptional(url, "doc_type", args.doc_type);
  url.searchParams.set("size", String(asPositiveInt(args.size, "size") || 10));
  url.searchParams.set("format", fmt);
  return url.toString();
}

export function parseInspirehepResultCount(text: string): number {
  const matches = [...String(text || "").matchAll(/([\d,]+)\s+results?/gi)];
  const raw = matches.length ? matches[matches.length - 1][1] : undefined;
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "INSPIRE-HEP result count node was not found", { probe: "visibleText /[\\d,]+ results/" });
  return Number(raw.replace(/,/g, ""));
}

export function parseInspirehepItemsFromHtml(html: string): InspirehepItem[] {
  const body = String(html || "");
  const linkPattern = /<a(?=[^>]*href=["']\/literature\/(\d+)["'])(?=[^>]*class=["'][^"']*result-item-title[^"']*["'])[^>]*>([\s\S]*?)<\/a>/gi;
  const links = [...body.matchAll(linkPattern)];
  return links.map((match, index) => {
    const control_number = match[1];
    const title = cleanText(match[2]);
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < links.length ? (links[index + 1].index || body.length) : body.length;
    const tail = cleanText(body.slice(start, end));
    const arxiv_eprint = /e-Print:\s*([\d.]+)\s*\[/i.exec(tail)?.[1] || "";
    const citationsRaw = /(\d+)\s+citation/i.exec(tail)?.[1];
    return { control_number, title, authors: authorsFromText(tail.split(/\(\w{3}\s+\d{1,2},\s+\d{4}\)|e-Print:|Published in:|Contribution to:/i)[0] || ""), year: yearFromText(tail), url: new URL(`/literature/${control_number}`, INSPIREHEP_ORIGIN).toString(), arxiv_eprint, citations: citationsRaw === undefined ? null : Number(citationsRaw) };
  }).filter((item) => item.control_number && item.title).slice(0, 100);
}

export function parseInspirehepItemsFromVisibleText(text: string): InspirehepItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const records = normalized.split(/(?=#[0-9]+\s+)/).slice(1);
  return records.map((record) => {
    const rank = /^#(\d+)\s+/.exec(record)?.[1] || "";
    const arxiv_eprint = /e-Print:\s*([\d.]+)\s*\[/i.exec(record)?.[1] || "";
    const citationsRaw = /(\d+)\s+citation/i.exec(record)?.[1];
    const beforeRank = normalized.split(`#${rank}`)[0] || "";
    const title = beforeRank.split(/Citation Summary Most Recent|\d+ citations?/i).pop()?.trim().slice(0, 260) || "";
    return { control_number: "", title, authors: authorsFromText(record.split(/\(\w{3}\s+\d{1,2},\s+\d{4}\)|e-Print:|Published in:|Contribution to:/i)[0] || ""), year: yearFromText(record), url: "", arxiv_eprint, citations: citationsRaw === undefined ? null : Number(citationsRaw) };
  }).filter((item) => item.title || item.arxiv_eprint).slice(0, 100);
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

async function withAllocatedInspirehepPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "INSPIRE-HEP tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function waitForInspirehepHome(page: any): Promise<void> {
  for (let i = 0; i < 18; i++) {
    if (await page.locator("input.ant-input.ant-input-lg").count().catch(() => 0)) return;
    await sleep(3000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "INSPIRE-HEP homepage search box did not hydrate", { selector: "input.ant-input.ant-input-lg" });
}

async function readInspirehepResultsPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: InspirehepItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 30; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      if (/errors\/network/i.test(url) || /Connection error/i.test(visibleText)) throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "INSPIRE-HEP SPA data layer reported network error", { url });
      const resultCount = parseInspirehepResultCount(visibleText);
      const linkCount = await page.locator('a[href^="/literature/"]').count().catch(() => 0);
      const items = parseInspirehepItemsFromHtml(html);
      stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseInspirehepItemsFromVisibleText(visibleText) };
      if (resultCount >= 0 && (linkCount > 0 || resultCount === 0)) break;
    } catch (error) { lastError = error; }
    await sleep(1000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "INSPIRE-HEP results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function driveInAppSearch(page: any, query: string): Promise<void> {
  await waitForInspirehepHome(page);
  const input = page.locator("input.ant-input.ant-input-lg").first();
  await input.fill("");
  await input.type(requireQuery(query), { delay: 0 });
  await page.locator("button.ant-input-search-button").first().click({ timeout: 10000 });
}

async function clickFacet(page: any, facetValue: string): Promise<void> {
  const escaped = facetValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const selector = `[data-test-id="checkbox-aggregation-option-${escaped}"]`;
  const count = await page.locator(selector).count().catch(() => 0);
  if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "INSPIRE-HEP facet checkbox was not found", { selector, facetValue });
  await page.locator(selector).first().click({ timeout: 10000 });
}

export async function researchInspirehepSearch(args: InspirehepSearchArgs): Promise<{ result_count: number; items: InspirehepItem[]; query_url: string; confirm_url: string; confirm_title: string }> {
  const query_url = buildInspirehepSearchUrl(args);
  const profile = args.profile || "nuaa-inspirehep";
  const tabId = args.tab_id || `research-inspirehep-search-${Date.now()}`;
  const page = await withAllocatedInspirehepPage(profile, INSPIREHEP_ORIGIN, tabId, (args.cdp_port || 9227), async (p) => {
    await driveInAppSearch(p, args.query);
    return await readInspirehepResultsPage(p);
  });
  return { result_count: page.resultCount, items: page.items, query_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchInspirehepFilter(args: InspirehepFilterArgs): Promise<{ result_count: number; items: InspirehepItem[]; refined_url: string; confirm_url: string; confirm_title: string; applied_filters: Record<string, string> }> {
  const refined_url = buildInspirehepFilterUrl(args);
  const profile = args.profile || "nuaa-inspirehep";
  const tabId = args.tab_id || `research-inspirehep-filter-${Date.now()}`;
  const applied: Record<string, string> = {};
  const page = await withAllocatedInspirehepPage(profile, INSPIREHEP_ORIGIN, tabId, (args.cdp_port || 9227), async (p) => {
    await driveInAppSearch(p, args.query);
    await readInspirehepResultsPage(p);
    if (args.doc_type) { await clickFacet(p, args.doc_type); applied.doc_type = args.doc_type; }
    else if (args.facet_value) { await clickFacet(p, args.facet_value); if (args.facet) applied[String(args.facet)] = args.facet_value; }
    return await readInspirehepResultsPage(p);
  });
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title, applied_filters: applied };
}

export async function researchInspirehepExport(args: InspirehepExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: InspirehepExportFormat; source_url: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "nuaa-inspirehep";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "inspirehep"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const source_url = args.control_number ? buildInspirehepRecordExportUrl(args.control_number, format) : buildInspirehepResultsetExportUrl(args);
  const filename = args.filename || (args.control_number ? `inspirehep-${safeFileToken(String(args.control_number))}.${extensionForFormat(format)}` : `inspirehep-resultset.${extensionForFormat(format)}`);
  const tabId = args.tab_id || `research-inspirehep-export-${Date.now()}`;
  return await withAllocatedInspirehepPage(profile, INSPIREHEP_ORIGIN, tabId, (args.cdp_port || 9227), async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "INSPIRE-HEP export endpoint returned a non-OK status", { status: response.status?.(), source_url });
      const body = Buffer.from(await response.body());
      const artifact_path = uniquePath(downloadDir, filename);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && !/^@\w+\{[^,]+,/m.test(text)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "INSPIRE-HEP BibTeX artifact failed content validation", { artifact_path, source_url });
      }
      if (format === "json") JSON.parse(text);
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "INSPIRE-HEP export failed", { source_url, format, cause: error?.message || String(error) });
    }
  });
}
