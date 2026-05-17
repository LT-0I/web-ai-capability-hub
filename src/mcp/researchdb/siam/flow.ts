const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type SiamArea = "AllField" | "Title" | "Contrib" | "Keyword" | "Abstract" | "Affiliation";
export type SiamExportFormat = "ris" | "endnote" | "bibtex" | "medlars" | "refworks";

export interface SiamItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; }
export interface SiamSearchArgs { query: string; area?: SiamArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface SiamFilterArgs extends SiamSearchArgs { after_year?: number; before_year?: number; pub_type?: string; series_key?: string; contrib_raw?: string; concept_id?: string; }
export interface SiamExportArgs { doi: string; format?: SiamExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SIAM_ORIGIN = "https://epubs.siam.org";
const VALID_AREAS = new Set(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"]);
const VALID_FORMATS = new Set(["ris", "endnote", "bibtex", "medlars", "refworks"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): SiamArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SIAM search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as SiamArea;
}
function normalizeFormat(format?: string): SiamExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SIAM export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as SiamExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}

export function buildSiamSearchUrl(args: SiamSearchArgs): string {
  const url = new URL("/action/doSearch", SIAM_ORIGIN);
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildSiamFilterUrl(args: SiamFilterArgs): string {
  const url = new URL(buildSiamSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (args.pub_type) url.searchParams.set("PubType", args.pub_type);
  if (args.series_key) url.searchParams.set("SeriesKey", args.series_key);
  if (args.contrib_raw) url.searchParams.set("ContribRaw", args.contrib_raw);
  if (args.concept_id) url.searchParams.set("ConceptID", args.concept_id);
  return url.toString();
}

export function buildSiamCitationUrl(doi: string): string {
  const url = new URL("/action/showCitFormats", SIAM_ORIGIN);
  url.searchParams.set("doi", requireDoi(doi));
  return url.toString();
}

export function parseSiamResultCount(text: string): number {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const raw = /^(\d[\d,]*)$/.exec(source)?.[1] || /Results:\s*\d+\s*-\s*\d+\s*of\s*([\d,]+)/i.exec(source)?.[1] || /\b([\d,]+)\s+results?\b/i.exec(source)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SIAM result count node was not found", { probe: ".result__count or Results: 1 - n of N" });
  return Number(raw.replace(/,/g, ""));
}

function decodeHtml(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1137\/[A-Za-z0-9%().;:_/-]+/i.exec(text)?.[0] || "").replace(/[,.;]+$/, ""); }
function doiFromHref(href: string): string {
  const raw = /\/doi\/(?:abs\/|full\/)?([^?#"']+)/i.exec(href || "")?.[1] || "";
  return raw ? decodeURIComponent(raw).replace(/[,.;]+$/, "") : "";
}
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:SIAM Journal|Multiscale Modeling|Theory of Probability|Journal Article|Abstract|Read Now|First Page)\b/i)[0] || "";
  return beforeJournal.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^(Article|Published|Views|Citations|Select|Download|Full Access)$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:SIAM Journal on [A-Za-z &-]+|SIAM\/ASA Journal on [A-Za-z &-]+|Multiscale Modeling & Simulation|Theory of Probability & Its Applications|SIAM Review)/)?.[0] || "").trim();
}

export function parseSiamItemsFromHtml(html: string): SiamItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<li\b|<\/ul>|$)/gi)].map((m) => m[0]).filter((block) => /\/doi\/10\.1137\//i.test(block) || /name=["']doi["']/i.test(block));
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<a[^>]+href=["'][^"']*\/doi\/10\.1137\/[^"']+["'][^>]*>[\s\S]*?<\/a>[\s\S]*?(?=<a[^>]+href=["'][^"']*\/doi\/10\.1137\/|$)/gi)].map((m) => m[0]);
  return fallbackBlocks.map((block) => {
    const href = /<a[^>]+href=["']([^"']*\/doi\/10\.1137\/[^"']+)["'][^>]*>/i.exec(block)?.[1] || "";
    const checkboxDoi = /<input[^>]+name=["']doi["'][^>]+value=["']([^"']+)["']/i.exec(block)?.[1] || "";
    const doi = (checkboxDoi && decodeHtml(checkboxDoi)) || doiFromHref(href) || doiFromText(cleanText(block));
    const title = cleanText(/<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*\/doi\/10\.1137\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /class=["'][^"']*hlFld-Title[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(block)?.[1] || "") || cleanText(block).slice(0, 160);
    const text = cleanText(block).replace(title, "");
    return { title, authors: authorsFromText(text), doi, journal: journalFromText(text), year: yearFromText(text) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseSiamItemsFromVisibleText(text: string): SiamItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const doiMatches = [...normalized.matchAll(/10\.1137\/[A-Za-z0-9%().;:_/-]+/gi)];
  return doiMatches.map((match) => {
    const doi = match[0].replace(/[,.;]+$/, "");
    const start = Math.max(0, (match.index || 0) - 360);
    const piece = normalized.slice(start, (match.index || 0) + match[0].length);
    const year = yearFromText(piece);
    const title = piece.split(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+\s*(?:,|and)|SIAM Journal|Multiscale Modeling|Theory of Probability|Volume\s+\d+)/)[0].replace(/^(?:Results?:?\s*\d+\s*-\s*\d+\s*of\s*\d+|Article|Download PDFs?|Abstract|Read Now)\s*/i, "").trim();
    const authorPart = piece.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, journal: journalFromText(piece), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readSiamPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: SiamItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const observed = await page.evaluate(() => {
        const text = (sel: string) => (document.querySelector(sel)?.textContent || "").trim();
        const rows = Array.from(document.querySelectorAll("ul.rlist.search-result__body.items-results > li")).length;
        return { visibleText: document.body?.innerText || "", title: document.title || "", html: document.documentElement?.outerHTML || "", countText: text(".result__count"), applied: text(".facet__list--applied"), rows };
      });
      const resultCount = parseSiamResultCount(observed.countText || observed.visibleText);
      const items = parseSiamItemsFromHtml(observed.html);
      stable = { visibleText: observed.visibleText, title: observed.title, html: observed.html, resultCount, items: items.length ? items : parseSiamItemsFromVisibleText(observed.visibleText) };
      if (resultCount === lastCount && (observed.rows || stable.items.length)) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SIAM results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedSiamPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "SIAM tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchSiamSearch(args: SiamSearchArgs): Promise<{ result_count: number; items: SiamItem[]; query_url: string }> {
  const query_url = buildSiamSearchUrl(args);
  const profile = args.profile || "research-siam";
  const tabId = args.tab_id || `research-siam-search-${Date.now()}`;
  const page = await withAllocatedSiamPage(profile, query_url, tabId, args.cdp_port, (p) => readSiamPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchSiamFilter(args: SiamFilterArgs): Promise<{ result_count: number; items: SiamItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildSiamFilterUrl(args);
  const profile = args.profile || "research-siam";
  const tabId = args.tab_id || `research-siam-filter-${Date.now()}`;
  const page = await withAllocatedSiamPage(profile, refined_url, tabId, args.cdp_port, (p) => readSiamPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

function artifactNameFor(doi: string, format: SiamExportFormat): string {
  const suffix = doi.split("/").pop() || doi;
  return `siam_${suffix.replace(/[^A-Za-z0-9._-]+/g, "_")}.${format}`;
}

export async function researchSiamExport(args: SiamExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: SiamExportFormat; doi: string; content_type: string | null; content_disposition: string | null }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-siam";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "siam"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const citationUrl = buildSiamCitationUrl(doi);
  const tabId = args.tab_id || `research-siam-export-${Date.now()}`;
  return await withAllocatedSiamPage(profile, citationUrl, tabId, args.cdp_port, async (page) => {
    try {
      for (let i = 0; i < 5; i++) {
        const ready = await page.evaluate(() => Boolean(document.querySelector("form[name='frmCitmgr']") && document.querySelector("#ris") && document.querySelector("#direct"))).catch(() => false);
        if (ready) break;
        await sleep(3000);
      }
      const formReady = await page.evaluate(() => Boolean(document.querySelector("form[name='frmCitmgr']") && document.querySelector("#ris") && document.querySelector("#direct"))).catch(() => false);
      if (!formReady) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SIAM citation export form was not found", { selectors: ["form[name='frmCitmgr']", "#ris", "#direct"] });
      const captured = await page.evaluate(async ({ d, fmt }) => {
        const body = new URLSearchParams({ doi: d, format: fmt, direct: "false", include: "cit", submit: "Export citation data" });
        const resp = await fetch("/action/downloadCitation", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(), credentials: "include" });
        const text = await resp.text();
        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => { headers[k] = v; });
        return { status: resp.status, url: resp.url, headers, text };
      }, { d: doi, fmt: format });
      const contentType = captured.headers["content-type"] || null;
      const contentDisposition = captured.headers["content-disposition"] || null;
      if (captured.status !== 200 || !/attachment/i.test(contentDisposition || "")) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SIAM export did not return an attachment response", { status: captured.status, content_type: contentType, content_disposition: contentDisposition });
      }
      if (format === "ris" && !/application\/x-research-info-systems/i.test(contentType || "")) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SIAM RIS export returned an unexpected content type", { content_type: contentType });
      }
      const artifact_path = path.join(downloadDir, artifactNameFor(doi, format));
      fs.writeFileSync(artifact_path, captured.text, "utf-8");
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || !text.includes(doi))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SIAM RIS artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, content_type: contentType, content_disposition: contentDisposition };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "SIAM export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
