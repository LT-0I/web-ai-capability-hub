const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type AcmArea = "AllField" | "Title" | "PublicationTitle" | "Contrib" | "Abstract" | "Fulltext" | "Affiliation" | "Keyword" | "ConferenceLocation" | "Sponsor" | "ISBN" | "DOI";
export type AcmExportFormat = "bibtex" | "endnote" | "acm";

export interface AcmItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; }
export interface AcmSearchArgs { query: string; area?: AcmArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface AcmFilterArgs extends AcmSearchArgs { after_year?: number; before_year?: number; sort_by?: "downloaded" | "cited" | "relevance" | string; facet?: string; content_type?: string; author?: string; publisher?: string; }
export interface AcmExportArgs { doi: string; format?: AcmExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const ACM_ORIGIN = "https://dl.acm.org";
const VALID_AREAS = new Set(["AllField", "Title", "PublicationTitle", "Contrib", "Abstract", "Fulltext", "Affiliation", "Keyword", "ConferenceLocation", "Sponsor", "ISBN", "DOI"]);
const VALID_FORMATS = new Set(["bibtex", "endnote", "acm"]);
const VALID_SORTS = new Set(["downloaded", "cited", "relevance"]);
const FORMAT_EXTENSIONS: Record<AcmExportFormat, string> = { bibtex: "bib", endnote: "enw", acm: "txt" };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "acm"; }
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
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): AcmArea {
  const out = area || "AllField";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ACM search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as AcmArea;
}
function normalizeFormat(format?: string): AcmExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ACM export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as AcmExportFormat;
}
function normalizeSort(sort?: string): string | undefined {
  if (!sort) return undefined;
  if (!VALID_SORTS.has(sort)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ACM sort: ${sort}`, { sort, valid: [...VALID_SORTS] });
  return sort;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}
function assertNoPremiumFacet(args: AcmFilterArgs): void {
  const requested = ["facet", "content_type", "author", "publisher"].filter((key) => (args as any)[key]);
  if (requested.length) {
    throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "ACM post-results facet sidebar is Premium-gated under Basic Edition; use after_year/before_year or sort_by instead", { requested });
  }
}

export function buildAcmSearchUrl(args: AcmSearchArgs): string {
  const url = new URL("/action/doSearch", ACM_ORIGIN);
  url.searchParams.set("fillQuickSearch", "false");
  url.searchParams.set("target", "advanced");
  url.searchParams.set("expand", "dl");
  url.searchParams.set("field1", normalizeArea(args.area));
  url.searchParams.set("text1", requireQuery(args.query));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildAcmFilterUrl(args: AcmFilterArgs): string {
  assertNoPremiumFacet(args);
  const url = new URL(buildAcmSearchUrl(args));
  const after = asPositiveInt(args.after_year, "after_year");
  const before = asPositiveInt(args.before_year, "before_year");
  const sort = normalizeSort(args.sort_by);
  if (after) url.searchParams.set("AfterYear", String(after));
  if (before) url.searchParams.set("BeforeYear", String(before));
  if (sort) url.searchParams.set("sortBy", sort);
  return url.toString();
}

export function buildAcmDoiSearchUrl(doi: string): string {
  return buildAcmSearchUrl({ query: requireDoi(doi), area: "DOI" });
}

export function parseAcmResultCount(text: string): number {
  const direct = /([\d,]+)\s+Results?\b/i.exec(text || "");
  const fallback = /Results:\s*\d+\s*-\s*\d+\s*of\s*([\d,]+)/i.exec(text || "");
  const raw = direct?.[1] || fallback?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ACM result count node was not found", { probe: "N Results" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1145\/[A-Za-z0-9.]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeYear = text.split(/\b(?:19\d{2}|20\d{2})\b/)[0] || "";
  return beforeYear.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^PDF|Abstract|Export Citation|View|Save|Share$/i.test(s)).slice(0, 12);
}
function publicationFromText(text: string): string {
  return (text.match(/(?:Proceedings of [^.;]+|Communications of the ACM|ACM Transactions on [^.;]+|[A-Z][A-Za-z &-]+ Conference[^.;]*)/)?.[0] || "").trim();
}

export function parseAcmItemsFromHtml(html: string): AcmItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<li[^>]+class=["'][^"']*(?:search__item|issue-item-container)[^"']*["'][^>]*>([\s\S]*?)(?=<li[^>]+class=["'][^"']*(?:search__item|issue-item-container)|$)/gi)].map((m) => m[1]);
  const fallbackBlocks = blocks.length ? blocks : [...source.matchAll(/<[^>]+class=["'][^"']*issue-item[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*issue-item|$)/gi)].map((m) => m[1]);
  return fallbackBlocks.map((block) => {
    const text = cleanText(block);
    const doi = doiFromText(text) || doiFromText(block);
    const title = cleanText(/<h[\d][^>]*class=["'][^"']*issue-item__title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<span[^>]*class=["'][^"']*hlFld-Title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<h[\d][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<a[^>]+class=["'][^"']*issue-item__title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || text.slice(0, 160);
    const rest = text.replace(title, "");
    return { title, authors: authorsFromText(rest), doi, publication: publicationFromText(rest), year: yearFromText(rest) };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseAcmItemsFromVisibleText(text: string): AcmItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/[\d,]+\s+Results?\b/i).pop() || normalized;
  const pieces = tail.split(/\s+Export Citation\s+/).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const year = yearFromText(beforeDoi);
    const title = beforeDoi.split(/\s+(?:Authors?|Published in|Conference|Proceedings|\b(?:19\d{2}|20\d{2})\b)/i)[0].replace(/^(PDF|Save to Binder|View|Share)\s+/, "").trim();
    const authorPart = beforeDoi.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, publication: publicationFromText(beforeDoi), year };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readAcmPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: AcmItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseAcmResultCount(visibleText);
      const items = parseAcmItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseAcmItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ACM results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function dismissAcmBasicEditionModal(page: any): Promise<void> {
  const close = page.locator("#closeModalBtn");
  if (await close.count().catch(() => 0)) {
    await close.click({ timeout: 3000 }).catch(() => undefined);
    await sleep(500);
  }
}

async function readAcmCitationFromModal(page: any, format: AcmExportFormat, doi: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const citation = await page.locator('#exportCitation input[name="content"]').inputValue({ timeout: 3000 }).catch(() => "");
    if (citation.trim() && citation.includes(doi)) return citation;
    await sleep(1500);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ACM citation modal content was not populated", { doi, format });
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

async function withAllocatedAcmPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ACM tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchAcmSearch(args: AcmSearchArgs): Promise<{ result_count: number; items: AcmItem[]; query_url: string }> {
  const query_url = buildAcmSearchUrl(args);
  const profile = args.profile || "research-acm";
  const tabId = args.tab_id || `research-acm-search-${Date.now()}`;
  const page = await withAllocatedAcmPage(profile, query_url, tabId, args.cdp_port, (p) => readAcmPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchAcmFilter(args: AcmFilterArgs): Promise<{ result_count: number; items: AcmItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildAcmFilterUrl(args);
  const profile = args.profile || "research-acm";
  const tabId = args.tab_id || `research-acm-filter-${Date.now()}`;
  const page = await withAllocatedAcmPage(profile, refined_url, tabId, args.cdp_port, (p) => readAcmPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchAcmExport(args: AcmExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: AcmExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-acm";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "acm"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const searchUrl = buildAcmDoiSearchUrl(doi);
  const tabId = args.tab_id || `research-acm-export-${Date.now()}`;
  return await withAllocatedAcmPage(profile, searchUrl, tabId, args.cdp_port, async (page) => {
    try {
      await readAcmPage(page);
      await dismissAcmBasicEditionModal(page);
      const button = 'li.search__item:first-of-type button[aria-label="Export Citation"]';
      const count = await page.locator(button).count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ACM per-result Export Citation button was not found", { selector: button });
      await page.locator(button).click({ timeout: 12000 });
      for (let i = 0; i < 5; i++) {
        const modalText = await page.locator("#exportCitation").innerText({ timeout: 10000 }).catch(() => "");
        if (!/Loading Citation/i.test(modalText) && /@(inproceedings|article)\{|Download citation|ACM Ref/i.test(modalText)) break;
        await sleep(2000);
      }
      if (format !== "bibtex") {
        const selectValue = format === "endnote" ? "endNote" : "acm";
        await page.locator("#citation-format").selectOption(selectValue, { timeout: 10000 });
        for (let i = 0; i < 5; i++) {
          const modalText = await page.locator("#exportCitation").innerText({ timeout: 10000 }).catch(() => "");
          if (!/Loading Citation/i.test(modalText)) break;
          await sleep(2000);
        }
      }
      const citation = await readAcmCitationFromModal(page, format, doi);
      const artifact_path = uniquePath(downloadDir, `acm-${safeFileToken(doi)}-${format}.${FORMAT_EXTENSIONS[format]}`);
      fs.writeFileSync(artifact_path, citation, "utf-8");
      const text = fs.readFileSync(artifact_path, "utf-8");
      const valid = format === "bibtex" ? /@(inproceedings|article)\{/i.test(text) : text.trim().length > 0;
      if (!valid || !text.includes(doi)) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ACM citation artifact failed content validation", { artifact_path, doi, format });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "ACM export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
