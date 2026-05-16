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

export type ScieloExportFormat = "ris" | "bibtex" | "citation" | "csv";

export interface ScieloItem { title: string; authors: string[]; doi: string; journal: string; year: number | null; url: string; pid: string; collection: string; }
export interface ScieloSearchArgs { query: string; lang?: string; count?: number; from?: number; page?: number; sort?: string; format?: string; profile?: string; cdp_port?: number; tab_id?: string; }
export interface ScieloFilterArgs extends ScieloSearchArgs { collection?: string; country?: string; journal_title?: string; language?: string; year_cluster?: string | number; subject_area?: string; wok_subject_categories?: string; wok_citation_index?: string; is_citable?: string | number; literature_type?: string; network_classification?: string; facets?: Record<string, string | number | boolean | Array<string | number | boolean>>; }
export interface ScieloExportArgs extends ScieloFilterArgs { export_format?: ScieloExportFormat | string; selection?: "current_page" | "all_results" | "selection" | string; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SCIELO_ORIGIN = "https://search.scielo.org";
const VALID_FORMATS = new Set(["ris", "bibtex", "citation", "csv"]);
const FACET_PARAM: Record<string, string> = {
  collection: "in",
  country: "in",
  journal_title: "journal_title",
  language: "la",
  year_cluster: "year_cluster",
  subject_area: "subject_area",
  wok_subject_categories: "wok_subject_categories",
  wok_citation_index: "wok_citation_index",
  is_citable: "is_citable",
  literature_type: "type",
  network_classification: "network_classification"
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asNonNegativeInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a non-negative integer`, { [name]: value });
  return n;
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function normalizeFormat(format?: string): ScieloExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SciELO export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as ScieloExportFormat;
}
function cleanText(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1590\/[A-Za-z0-9._;()/:+-]+/i.exec(text)?.[0] || /10\.[0-9]{4,9}\/[A-Za-z0-9._;()/:+-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function attr(block: string, name: string): string { return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(block)?.[1] || ""; }
function authorsFromText(text: string): string[] {
  const match = /\b(?:Autor(?:es)?|Authors?)\s*:?\s*(.+?)(?:\s+(?:Revista|Journal|SciELO|DOI|Resumo|Abstract|\b19\d{2}\b|\b20\d{2}\b)|$)/i.exec(text);
  const raw = match?.[1] || "";
  return raw.split(/;|,|\band\b|\be\b/i).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
function collectionFromId(id: string): string {
  const match = /-([A-Za-z0-9]+)$/.exec(id || "");
  return match?.[1] || "";
}
function pidFromId(id: string): string { return String(id || "").replace(/-[A-Za-z0-9]+$/, ""); }
function addFacet(url: URL, facet: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (item === undefined || item === null || item === "") continue;
    url.searchParams.append(`filter[${facet}][]`, String(item));
  }
}

export function buildScieloSearchUrl(args: ScieloSearchArgs): string {
  const url = new URL("/", SCIELO_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("lang", args.lang || "pt");
  url.searchParams.set("count", String(asPositiveInt(args.count, "count") || 15));
  url.searchParams.set("from", String(asNonNegativeInt(args.from, "from") || 0));
  url.searchParams.set("output", "site");
  url.searchParams.set("sort", args.sort || "");
  url.searchParams.set("format", args.format || "summary");
  url.searchParams.set("fb", "");
  url.searchParams.set("page", String(asPositiveInt(args.page, "page") || 1));
  return url.toString();
}

export function buildScieloFilterUrl(args: ScieloFilterArgs): string {
  const url = new URL(buildScieloSearchUrl(args));
  for (const [argKey, facet] of Object.entries(FACET_PARAM)) addFacet(url, facet, (args as any)[argKey]);
  for (const [facet, value] of Object.entries(args.facets || {})) addFacet(url, facet, value);
  return url.toString();
}

export function buildScieloExportUrl(args: ScieloExportArgs): string {
  const url = new URL(buildScieloFilterUrl(args));
  url.searchParams.set("output", normalizeFormat(args.export_format));
  return url.toString();
}

export function parseScieloResultCount(text: string): number {
  const raw = /Resultados?\s*:\s*([\d.,]+)/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO result count node was not found", { probe: "div.filterTitle Resultados: N" });
  return Number(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
}

export function parseScieloItemsFromHtml(html: string): ScieloItem[] {
  const source = String(html || "");
  const blocks = [...source.matchAll(/<div[^>]+class=["'][^"']*\bitem\b[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*\bitem\b|<\/div>\s*<\/div>\s*<\/div>|$)/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const id = attr(block, "id");
    const link = /<a[^>]+href=["']([^"']*scielo\.php\?script=sci_arttext[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const url = link?.[1] ? new URL(link[1].replace(/&amp;/g, "&"), SCIELO_ORIGIN).toString() : "";
    const title = cleanText(link?.[2] || /<div[^>]+class=["'][^"']*line[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 260);
    const text = cleanText(block);
    const journal = (/\b(?:Revista|Journal|Periódico)\s*:?\s*(.+?)(?:\s+\b(?:19\d{2}|20\d{2})\b|\s+DOI|$)/i.exec(text)?.[1] || "").trim();
    return { title, authors: authorsFromText(text), doi: doiFromText(text), journal, year: yearFromText(text), url, pid: pidFromId(id), collection: collectionFromId(id) };
  }).filter((item) => item.title || item.url || item.pid).slice(0, 100);
}

export function parseScieloItemsFromVisibleText(text: string): ScieloItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Resultados?\s*:\s*[\d.,]+/i).pop() || normalized;
  const pieces = tail.split(/\s+(?:Resumo|Abstract|Texto completo|SciELO)\s+/i).filter((p) => /10\.|scielo|JOUR|Revista|Journal|20\d{2}|19\d{2}/i.test(p));
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const title = piece.split(/\s+(?:Autores?|Authors?|DOI|10\.|Revista|Journal)\b/i)[0].replace(/^(Exportar|Filtros selecionados|LIMPAR)\s+/i, "").trim().slice(0, 260);
    return { title, authors: authorsFromText(piece), doi, journal: "", year: yearFromText(piece), url: "", pid: "", collection: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

function validateScieloArtifact(artifactPath: string, format: ScieloExportFormat, expectedCount?: number): void {
  const text = fs.readFileSync(artifactPath, "utf-8").replace(/^\uFEFF/, "");
  if (format === "ris") {
    const records = (text.match(/^TY  - /gm) || []).length;
    const ends = (text.match(/^ER  -/gm) || []).length;
    if (!records || records !== ends || (expectedCount && records !== expectedCount)) {
      throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SciELO RIS artifact failed content validation", { artifact_path: artifactPath, records, ends, expectedCount });
    }
  } else if (format === "bibtex" && !/@\w+\s*\{/i.test(text)) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SciELO BibTeX artifact failed content validation", { artifact_path: artifactPath });
  } else if (format === "csv" && !/[,;]/.test(text)) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SciELO CSV artifact failed content validation", { artifact_path: artifactPath });
  }
}

async function readScieloResultsPage(page: any, expectedUrl: string, requireSelectedFilters = false): Promise<{ visibleText: string; title: string; html: string; resultCount: number; items: ScieloItem[]; url: string; selectedFilters: boolean }> {
  let stable: any;
  let lastError: unknown;
  const expectedOutput = new URL(expectedUrl).searchParams.get("output") || "site";
  for (let i = 0; i < 12; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const url = page.url?.() || "";
      const state = await page.evaluate?.(() => ({ output: new URLSearchParams(location.search).get("output"), itemCount: document.querySelectorAll("div.results div.item").length })).catch(() => ({ output: "", itemCount: 0 }));
      const resultCount = parseScieloResultCount(visibleText);
      const selectedFilters = /Filtros selecionados/i.test(visibleText) && /LIMPAR/i.test(visibleText);
      if (expectedOutput === "site" && state.output !== "site") throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO location output did not match site results", { expectedUrl, url, observedOutput: state.output });
      if (requireSelectedFilters && !selectedFilters) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO selected-filter confirmation was not found", { expectedUrl, url });
      const items = parseScieloItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount, items: items.length ? items : parseScieloItemsFromVisibleText(visibleText), url, selectedFilters };
      if (resultCount >= 0 && (Number(state.itemCount) > 0 || stable.items.length > 0 || resultCount === 0)) break;
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedScieloPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "SciELO tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchScieloSearch(args: ScieloSearchArgs): Promise<{ result_count: number; items: ScieloItem[]; query_url: string }> {
  const query_url = buildScieloSearchUrl(args);
  const profile = args.profile || "nuaa-scielo";
  const tabId = args.tab_id || `research-scielo-search-${Date.now()}`;
  const page = await withAllocatedScieloPage(profile, query_url, tabId, args.cdp_port, (p) => readScieloResultsPage(p, query_url));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchScieloFilter(args: ScieloFilterArgs): Promise<{ result_count: number; items: ScieloItem[]; refined_url: string; confirm_url: string; confirm_title: string; selected_filters: boolean }> {
  const refined_url = buildScieloFilterUrl(args);
  const profile = args.profile || "nuaa-scielo";
  const tabId = args.tab_id || `research-scielo-filter-${Date.now()}`;
  const hasFacet = refined_url.includes("filter%5B") || refined_url.includes("filter[");
  const page = await withAllocatedScieloPage(profile, refined_url, tabId, args.cdp_port, (p) => readScieloResultsPage(p, refined_url, hasFacet));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title, selected_filters: page.selectedFilters };
}

export async function researchScieloExport(args: ScieloExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: ScieloExportFormat; source_url: string; result_count: number }> {
  const format = normalizeFormat(args.export_format);
  const profile = args.profile || "nuaa-scielo";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "scielo"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const resultsUrl = buildScieloFilterUrl(args);
  const source_url = buildScieloExportUrl(args);
  const tabId = args.tab_id || `research-scielo-export-${Date.now()}`;
  return await withAllocatedScieloPage(profile, resultsUrl, tabId, args.cdp_port, async (page) => {
    try {
      const state = await readScieloResultsPage(page, resultsUrl, resultsUrl.includes("filter%5B") || resultsUrl.includes("filter["));
      const count = await page.locator("a.openExport").count().catch(() => 0);
      if (!count) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO export trigger was not found", { selector: "a.openExport", resultsUrl });
      if (format !== "ris") {
        const radio = `#export_format_${format}`;
        await page.locator("a.openExport").click({ timeout: 10000 });
        await page.locator("#Export.modal, #Export").waitFor?.({ state: "visible", timeout: 10000 }).catch(() => undefined);
        const radioCount = await page.locator(radio).count().catch(() => 0);
        if (!radioCount) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO export format radio was not found", { selector: radio });
        await page.locator(radio).click({ timeout: 10000 });
      }
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "search.scielo.org",
        buttonSelector: format === "ris" ? "a.openExport" : "#exportForm input[name=\"s\"]",
        followUpSelector: format === "ris" ? "#exportForm input[name=\"s\"]" : undefined,
        downloadDir,
        timeoutMs: 60000,
        locateTimeoutMs: 20000,
        frameMinCount: 0,
        filenamePattern: format === "ris" ? "*.ris" : undefined
      });
      const artifact_path = clicked.path;
      validateScieloArtifact(artifact_path, format, format === "ris" ? state.resultCount : undefined);
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, source_url, result_count: state.resultCount };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw) ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "SciELO export failed through the sanctioned CDP artifact-click path", { format, resultsUrl, source_url, cause: error?.message || String(error) });
    }
  });
}
