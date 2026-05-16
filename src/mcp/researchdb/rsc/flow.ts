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

export type RscArea = "AllText" | "Title" | "DOI" | "ExactText" | "AtleastText" | "WithoutText";
export type RscAccessFacet = "Open Access";
export type RscExportFormat = "ris" | "bibtex" | "endnote" | "medline" | "procite" | "referencemanager" | "refworks";

export interface RscItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; article_url: string; }
export interface RscSearchArgs { query: string; area?: RscArea | string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface RscFilterArgs extends RscSearchArgs { access?: RscAccessFacet | string; }
export interface RscExportArgs { doi: string; article_url?: string; format?: RscExportFormat | string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const RSC_ORIGIN = "https://pubs.rsc.org";
const VALID_AREAS = new Set(["AllText", "Title", "DOI", "ExactText", "AtleastText", "WithoutText"]);
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "medline", "procite", "referencemanager", "refworks"]);
const FORMAT_LABELS: Record<RscExportFormat, string> = {
  ris: "RIS",
  bibtex: "BibTex",
  endnote: "EndNote",
  medline: "MEDLINE",
  procite: "ProCite",
  referencemanager: "ReferenceManager",
  refworks: "RefWorks"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeArea(area?: string): RscArea {
  const out = area || "AllText";
  if (!VALID_AREAS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported RSC search area: ${out}`, { area, valid: [...VALID_AREAS] });
  return out as RscArea;
}
function normalizeFormat(format?: string): RscExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported RSC export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as RscExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireDoi(doi: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required");
  return doi.trim();
}
function normalizeArticleUrl(articleUrl?: string): string | undefined {
  if (!articleUrl) return undefined;
  const url = new URL(articleUrl, RSC_ORIGIN);
  if (url.hostname !== "pubs.rsc.org" || !url.pathname.includes("/content/articlelanding/")) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "article_url must be an RSC articlelanding URL", { article_url: articleUrl });
  }
  return url.toString();
}

export function buildRscSearchUrl(args: RscSearchArgs): string {
  const url = new URL("/en/results/journals", RSC_ORIGIN);
  url.searchParams.set("Category", "Journal");
  url.searchParams.set(normalizeArea(args.area), requireQuery(args.query));
  url.searchParams.set("IncludeReference", "false");
  url.searchParams.set("SelectJournal", "false");
  url.searchParams.set("DateRange", "false");
  url.searchParams.set("SelectDate", "false");
  url.searchParams.set("Type", "Months");
  url.searchParams.set("PriceCode", "False");
  url.searchParams.set("OpenAccess", "false");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("PageSize", String(pageSize));
  return url.toString();
}

export function buildRscFilterUrl(args: RscFilterArgs): string {
  const url = new URL(buildRscSearchUrl(args));
  const access = args.access || "Open Access";
  if (access !== "Open Access") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported RSC access facet: ${access}`, { access, valid: ["Open Access"] });
  url.searchParams.set("Article Access", "Open Access");
  url.searchParams.set("SortBy", "Relevance");
  if (!url.searchParams.has("PageSize")) url.searchParams.set("PageSize", "25");
  url.searchParams.set("tab", "journal");
  url.searchParams.set("fcategory", "journal");
  url.searchParams.set("filter", "journal");
  return url.toString();
}

export function buildRscDoiSearchUrl(doi: string): string {
  return buildRscSearchUrl({ query: requireDoi(doi), area: "DOI" });
}

export function parseRscResultCount(text: string): number {
  const raw = /([0-9,]+)\s+results - Showing page/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "RSC result count node was not found", { probe: "N results - Showing page" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1039\/[A-Za-z0-9]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:RSC Adv\.|Chem\. Commun\.|J\. Mater\. Chem\.|Dalton Trans\.|Chemical Science|Nanoscale|Green Chem\.)\b|\b(?:19\d{2}|20\d{2})\b/)[0] || "";
  return beforeJournal.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^Open Access|Article|Review|Communication|PDF|HTML|Download|Supplementary$/i.test(s)).slice(0, 12);
}
function journalFromText(text: string): string {
  return (text.match(/(?:RSC Adv\.|Chem\. Commun\.|J\. Mater\. Chem\. [ABC]?|Dalton Trans\.|Chemical Science|Nanoscale|Green Chem\.|Phys\. Chem\. Chem\. Phys\.|Org\. Biomol\. Chem\.)/)?.[0] || "").trim();
}
function articleUrlFromBlock(block: string): string {
  const href = /<a[^>]+href=["']([^"']*\/en\/content\/articlelanding\/[^"']+)["']/i.exec(block)?.[1] || /href=["']([^"']*\/content\/articlelanding\/[^"']+)["']/i.exec(block)?.[1] || "";
  return href ? new URL(href, RSC_ORIGIN).toString() : "";
}

export function parseRscItemsFromHtml(html: string): RscItem[] {
  const source = String(html || "");
  const articleMatches = [...source.matchAll(/<a[^>]+href=["'][^"']*\/en\/content\/articlelanding\/[^"']+["'][\s\S]*?(?=<a[^>]+href=["'][^"']*\/en\/content\/articlelanding\/|$)/gi)].map((m) => m[0]);
  const blocks = articleMatches.length ? articleMatches : [...source.matchAll(/<[^>]+class=["'][^"']*(?:capsule|result|article)[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*(?:capsule|result|article)|$)/gi)].map((m) => m[1]);
  const seen = new Set<string>();
  return blocks.map((block) => {
    const text = cleanText(block);
    const article_url = articleUrlFromBlock(block);
    const doi = doiFromText(text) || doiFromText(block);
    const title = cleanText(/<a[^>]+href=["'][^"']*\/en\/content\/articlelanding\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || text.slice(0, 180);
    const rest = text.replace(title, "");
    return { title, authors: authorsFromText(rest), doi, journal: journalFromText(rest), year: yearFromText(rest), article_url };
  }).filter((item) => {
    const key = item.article_url || item.doi || item.title;
    if ((!item.title && !item.doi && !item.article_url) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

export function parseRscItemsFromVisibleText(text: string): RscItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/[0-9,]+\s+results - Showing page/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=Open Access\s+)/i).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const title = beforeDoi.replace(/^Open Access\s+/, "").split(/\s+(?:[A-Z][A-Za-z.'-]+,|RSC Adv\.|Chem\. Commun\.|\b(?:19\d{2}|20\d{2})\b)/)[0].trim();
    const rest = beforeDoi.slice(title.length).trim();
    return { title, authors: authorsFromText(rest), doi, journal: journalFromText(beforeDoi), year: yearFromText(beforeDoi), article_url: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readRscPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: RscItem[] }> {
  let lastCount = -1;
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseRscResultCount(visibleText);
      const items = parseRscItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseRscItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "RSC results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedRscPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "RSC tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function resolveRscArticleUrl(page: any, doi: string, explicitUrl?: string): Promise<string> {
  const normalized = normalizeArticleUrl(explicitUrl);
  if (normalized) return normalized;
  const search = await readRscPage(page);
  const byDoi = search.items.find((item) => item.article_url && (!item.doi || item.doi.toLowerCase() === doi.toLowerCase()));
  const anyArticle = byDoi || search.items.find((item) => item.article_url);
  if (!anyArticle?.article_url) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "RSC DOI search did not expose an articlelanding URL", { doi });
  return anyArticle.article_url;
}

export async function researchRscSearch(args: RscSearchArgs): Promise<{ result_count: number; items: RscItem[]; query_url: string }> {
  const query_url = buildRscSearchUrl(args);
  const profile = args.profile || "nuaa-rsc";
  const tabId = args.tab_id || `research-rsc-search-${Date.now()}`;
  const page = await withAllocatedRscPage(profile, query_url, tabId, args.cdp_port, (p) => readRscPage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchRscFilter(args: RscFilterArgs): Promise<{ result_count: number; items: RscItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildRscFilterUrl(args);
  const profile = args.profile || "nuaa-rsc";
  const tabId = args.tab_id || `research-rsc-filter-${Date.now()}`;
  const page = await withAllocatedRscPage(profile, refined_url, tabId, args.cdp_port, (p) => readRscPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchRscExport(args: RscExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: RscExportFormat; doi: string }> {
  const doi = requireDoi(args.doi);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "nuaa-rsc";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "rsc"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const startUrl = normalizeArticleUrl(args.article_url) || buildRscDoiSearchUrl(doi);
  const tabId = args.tab_id || `research-rsc-export-${Date.now()}`;
  return await withAllocatedRscPage(profile, startUrl, tabId, args.cdp_port, async (page) => {
    try {
      const articleUrl = await resolveRscArticleUrl(page, doi, args.article_url);
      if (page.url() !== articleUrl) await page.goto(articleUrl, { waitUntil: "domcontentloaded" });
      for (let i = 0; i < 5; i++) {
        const formCount = await page.locator('form[action*="getformatedresult"] #ResultAbstractFormat').count().catch(() => 0);
        if (formCount) break;
        await sleep(3000);
      }
      const selectCount = await page.locator("#ResultAbstractFormat").count().catch(() => 0);
      if (!selectCount) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "RSC citation export format select was not found", { selector: "#ResultAbstractFormat" });
      await page.locator("#ResultAbstractFormat").selectOption(FORMAT_LABELS[format], { timeout: 10000 });
      const selected = await page.locator("#ResultAbstractFormat").inputValue({ timeout: 5000 }).catch(() => "");
      if (selected !== FORMAT_LABELS[format]) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "RSC citation export format selection did not stick", { selected, expected: FORMAT_LABELS[format] });
      const suffix = new URL(articleUrl).pathname.split("/").filter(Boolean).pop() || "content/articlelanding";
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: suffix,
        buttonSelector: "#Submit1",
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 10000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - JOUR/m.test(text) || !/^ER  -/m.test(text) || !new RegExp(doi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "RSC RIS artifact failed content validation", { artifact_path, doi });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "RSC export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
