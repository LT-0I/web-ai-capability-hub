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

export type ScienceDirectExportFormat = "ris" | "bibtex" | "text" | "refworks";
export type ScienceDirectArticleType = "REV" | "FLA" | "CH" | "EN";
export type ScienceDirectAccessType = "openaccess";

export interface ScienceDirectItem { title: string; authors: string[]; publication: string; year: number | null; pii: string; access: string; article_type: string; }
export interface ScienceDirectSearchArgs {
  query: string;
  date?: string;
  pub?: string;
  authors?: string;
  affiliations?: string;
  tak?: string;
  title?: string;
  doc_id?: string;
  profile?: string;
  cdp_port?: number;
  tab_id?: string;
}
export interface ScienceDirectFilterArgs extends ScienceDirectSearchArgs {
  article_type?: ScienceDirectArticleType | string;
  year?: number;
  access_type?: ScienceDirectAccessType | string;
  facet_input_id?: string;
}
export interface ScienceDirectExportArgs extends ScienceDirectFilterArgs { format?: ScienceDirectExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SCIENCEDIRECT_ORIGIN = "https://www.sciencedirect.com";
const VALID_FORMATS = new Set(["ris", "bibtex", "text", "refworks"]);
const VALID_ARTICLE_TYPES = new Set(["REV", "FLA", "CH", "EN"]);
const VALID_ACCESS_TYPES = new Set(["openaccess"]);
const FORMAT_LABELS: Record<ScienceDirectExportFormat, string> = {
  ris: "Export citation to RIS",
  bibtex: "Export citation to BibTeX",
  text: "Export citation to text",
  refworks: "Save to RefWorks"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): ScienceDirectExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported ScienceDirect export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as ScienceDirectExportFormat;
}
function setIfPresent(url: URL, key: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) url.searchParams.set(key, value.trim());
}

export function buildScienceDirectSearchUrl(args: ScienceDirectSearchArgs): string {
  const url = new URL("/search", SCIENCEDIRECT_ORIGIN);
  url.searchParams.set("qs", requireQuery(args.query));
  setIfPresent(url, "date", args.date);
  setIfPresent(url, "pub", args.pub);
  setIfPresent(url, "authors", args.authors);
  setIfPresent(url, "affiliations", args.affiliations);
  setIfPresent(url, "tak", args.tak);
  setIfPresent(url, "title", args.title);
  setIfPresent(url, "docId", args.doc_id);
  return url.toString();
}

function facetFromArgs(args: ScienceDirectFilterArgs): { param: string; value: string; lastSelectedFacet: string; inputId: string } | undefined {
  if (args.facet_input_id) {
    const id = args.facet_input_id.trim();
    const match = /^(articleTypes|years|accessTypes)-(.+)$/.exec(id);
    if (!match) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Unsupported ScienceDirect facet_input_id", { facet_input_id: args.facet_input_id });
    return { param: match[1], value: match[2], lastSelectedFacet: match[1], inputId: id };
  }
  if (args.article_type) {
    const value = String(args.article_type).trim();
    if (!VALID_ARTICLE_TYPES.has(value)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Unsupported ScienceDirect article_type", { article_type: args.article_type, valid: [...VALID_ARTICLE_TYPES] });
    return { param: "articleTypes", value, lastSelectedFacet: "articleTypes", inputId: `articleTypes-${value}` };
  }
  const year = asPositiveInt(args.year, "year");
  if (year) return { param: "years", value: String(year), lastSelectedFacet: "years", inputId: `years-${year}` };
  if (args.access_type) {
    const value = String(args.access_type).trim();
    if (!VALID_ACCESS_TYPES.has(value)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Unsupported ScienceDirect access_type", { access_type: args.access_type, valid: [...VALID_ACCESS_TYPES] });
    return { param: "accessTypes", value, lastSelectedFacet: "accessTypes", inputId: `accessTypes-${value}` };
  }
  return undefined;
}

export function scienceDirectFacetInputId(args: ScienceDirectFilterArgs): string | undefined { return facetFromArgs(args)?.inputId; }

export function buildScienceDirectFilterUrl(args: ScienceDirectFilterArgs): string {
  const url = new URL(buildScienceDirectSearchUrl(args));
  const facet = facetFromArgs(args);
  if (facet) {
    url.searchParams.set(facet.param, facet.value);
    url.searchParams.set("lastSelectedFacet", facet.lastSelectedFacet);
  }
  return url.toString();
}

export function parseScienceDirectResultCount(text: string): number {
  const raw = /([\d,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ScienceDirect result count node was not found", { probe: "#srp-facets / N results" });
  return Number(raw.replace(/,/g, ""));
}

function decodeEntities(value: string): string {
  return (value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function cleanText(value: string): string { return decodeEntities(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function authorsFromText(text: string): string[] {
  const beforeView = text.split(/\b(?:View PDF|Abstract|Figures|Export|Graphical Abstract)\b/i)[0] || "";
  const beforeDate = beforeView.split(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:19\d{2}|20\d{2})\b/i)[0] || "";
  return beforeDate.split(/,| and |;/).map((s) => s.trim()).filter((s) => s && !/^(Full text access|Open access|Research article|Review article|Book chapter|Encyclopedia)$/i.test(s)).slice(0, 12);
}

export function parseScienceDirectItemsFromHtml(html: string): ScienceDirectItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<[^>]+id=["']S([A-Z0-9][^"']*)["'][^>]*>([\s\S]*?)(?=<[^>]+id=["']S[A-Z0-9][^"']*["']|$)/g)].map((m) => ({ pii: m[1], block: m[2] }));
  return blocks.map(({ pii, block }) => {
    const title = cleanText(new RegExp(`<a[^>]+id=["']title-S${pii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)<\\/a>`, "i").exec(block)?.[1]
      || /<a[^>]+id=["']title-[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1]
      || /<h\d[^>]*>([\s\S]*?)<\/h\d>/i.exec(block)?.[1]
      || "");
    const text = cleanText(block);
    const article_type = /\b(Research article|Review article|Book chapter|Encyclopedia)\b/i.exec(text)?.[1] || "";
    const access = /\b(Full text access|Open access)\b/i.exec(text)?.[1] || "";
    const rest = title ? text.replace(title, "") : text;
    const year = yearFromText(rest);
    const publication = rest.split(/\b(?:1?\d{0,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:19\d{2}|20\d{2})\b/i)[0]
      .replace(new RegExp(`^(?:${article_type}|${access})\\s*`, "i"), "")
      .trim();
    return { title: title || text.slice(0, 180), authors: authorsFromText(rest), publication, year, pii, access, article_type };
  }).filter((item) => item.title || item.pii).slice(0, 100);
}

export function parseScienceDirectItemsFromVisibleText(text: string): ScienceDirectItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Download selected articles\s+Export/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=\d+\s+(?:Research article|Review article|Book chapter|Encyclopedia))/i).slice(1);
  return pieces.map((piece) => {
    const article_type = /^(\d+\s+)?(Research article|Review article|Book chapter|Encyclopedia)/i.exec(piece)?.[2] || "";
    const access = /(Full text access|Open access)/i.exec(piece)?.[1] || "";
    const clean = piece.replace(/^\d+\s+/, "").replace(article_type, "").replace(access, "").trim();
    const year = yearFromText(clean);
    const title = clean.split(/\s+(?:[A-Z][A-Za-z&,: -]+)(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|19\d{2}|20\d{2})\b/)[0].trim();
    const rest = clean.slice(title.length).trim();
    const publication = rest.split(/\b(?:1?\d{0,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)|\b(?:19\d{2}|20\d{2})\b/i)[0].trim();
    return { title, authors: authorsFromText(rest), publication, year, pii: "", access, article_type };
  }).filter((item) => item.title).slice(0, 100);
}

async function readScienceDirectPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: ScienceDirectItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      await page.locator("#srp-facets, #search-advanced-form").first().waitFor({ timeout: 12000 }).catch(() => undefined);
      const visibleText = await page.locator("body").innerText({ timeout: 12000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseScienceDirectResultCount(visibleText);
      const items = parseScienceDirectItemsFromHtml(html);
      stable = { visibleText, title, html, url: page.url?.() || "", resultCount, items: items.length ? items : parseScienceDirectItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ScienceDirect results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedScienceDirectPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "ScienceDirect tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchScienceDirectSearch(args: ScienceDirectSearchArgs): Promise<{ result_count: number; items: ScienceDirectItem[]; query_url: string }> {
  const query_url = buildScienceDirectSearchUrl(args);
  const profile = args.profile || "research-sciencedirect";
  const tabId = args.tab_id || `research-sciencedirect-search-${Date.now()}`;
  const page = await withAllocatedScienceDirectPage(profile, query_url, tabId, args.cdp_port || 9243, (p) => readScienceDirectPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchScienceDirectFilter(args: ScienceDirectFilterArgs): Promise<{ result_count: number; items: ScienceDirectItem[]; refined_url: string; confirm_title: string; facet_input_id?: string; facet_checked?: boolean }> {
  const refined_url = buildScienceDirectFilterUrl(args);
  const profile = args.profile || "research-sciencedirect";
  const tabId = args.tab_id || `research-sciencedirect-filter-${Date.now()}`;
  const facetId = scienceDirectFacetInputId(args);
  const page = await withAllocatedScienceDirectPage(profile, refined_url, tabId, args.cdp_port || 9243, async (p) => {
    const read = await readScienceDirectPage(p);
    const facet_checked = facetId ? await p.locator(`#${facetId}`).evaluate((el: any) => el.getAttribute("aria-checked") === "true" || el.checked === true).catch(() => false) : undefined;
    return { ...read, facet_checked };
  });
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title, facet_input_id: facetId, facet_checked: page.facet_checked };
}

export async function researchScienceDirectExport(args: ScienceDirectExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: ScienceDirectExportFormat; record_count?: number; query_url: string }> {
  const format = normalizeFormat(args.format);
  const query_url = buildScienceDirectFilterUrl(args);
  const profile = args.profile || "research-sciencedirect";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "sciencedirect"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-sciencedirect-export-${Date.now()}`;
  return await withAllocatedScienceDirectPage(profile, query_url, tabId, args.cdp_port || 9243, async (page) => {
    try {
      await readScienceDirectPage(page);
      const selectAll = page.locator('label[for="select-all-results"]');
      if (!(await selectAll.count().catch(() => 0))) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "ScienceDirect select-all label was not found", { selector: 'label[for="select-all-results"]' });
      await selectAll.click({ timeout: 10000 });
      const checked = await page.locator("#select-all-results").evaluate((el: any) => el.getAttribute("aria-checked") === "true" || el.checked === true).catch(() => false);
      if (!checked) throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "ScienceDirect select-all checkbox did not become checked", { selector: "#select-all-results" });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "sciencedirect.com/search",
        buttonSelector: "button.export-all-link-button",
        followUpTextRegex: FORMAT_LABELS[format],
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      const record_count = format === "ris" ? (text.match(/^TY  - JOUR/gm) || []).length : undefined;
      if (format === "ris" && (!/^TY  - JOUR/m.test(text) || !/^ER  -/m.test(text) || record_count === 0)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ScienceDirect RIS artifact failed content validation", { artifact_path });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, record_count, query_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "ScienceDirect export failed", { format, query_url, cause: error?.message || String(error) });
    }
  });
}
