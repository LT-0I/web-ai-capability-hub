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

export type OpticaExportFormat = "bibtex" | "ris";

export interface OpticaItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; article_id: string; }
export interface OpticaSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface OpticaFilterArgs extends OpticaSearchArgs { year?: number; }
export interface OpticaExportArgs { query: string; article_id: string; format?: OpticaExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const OPTICA_ORIGIN = "https://opg.optica.org";
const VALID_FORMATS = new Set(["bibtex", "ris"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function normalizeFormat(format?: string): OpticaExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Optica export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as OpticaExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireArticleId(articleId: string): string {
  if (!articleId || !articleId.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "article_id is required");
  if (!/^[A-Za-z0-9_.-]+$/.test(articleId.trim())) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "article_id contains unsupported characters", { article_id: articleId });
  return articleId.trim();
}

export function buildOpticaSearchUrl(args: OpticaSearchArgs): string {
  const url = new URL("/search.cfm", OPTICA_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("ibsearch", "false");
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}

export function buildOpticaFilterUrl(args: OpticaFilterArgs): string {
  const url = new URL(buildOpticaSearchUrl(args));
  const year = asPositiveInt(args.year, "year");
  if (year && (year < 1917 || year > 2100)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "year must be in Optica's supported publication-year range", { year });
  return url.toString();
}

export function parseOpticaResultCounts(text: string): { result_count: number; total_count: number } {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const filtered = /([\d,]+)\s+results\s+\(filtered\)\s+of\s+([\d,]+)\s+total results/i.exec(normalized);
  const totalOnly = /([\d,]+)\s+total results/i.exec(normalized);
  const resultRaw = filtered?.[1] || totalOnly?.[1];
  const totalRaw = filtered?.[2] || totalOnly?.[1];
  if (!resultRaw || !totalRaw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica result count node was not found", { probe: "N results (filtered) of N total results" });
  return { result_count: Number(resultRaw.replace(/,/g, "")), total_count: Number(totalRaw.replace(/,/g, "")) };
}

function cleanText(value: string): string {
  return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1364\/[A-Za-z0-9_.-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforeJournal = text.split(/\b(?:Chinese Optics Letters|Optics Express|Optics Letters|Journal of Optical Communications and Networking|Applied Optics|Biomedical Optics Express|Optica|Photonics Research)\b/i)[0] || "";
  return beforeJournal.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^(Article|Abstract|Full text|PDF|Export|Citation|View|Select|Previous|Next)$/i.test(s)).slice(0, 16);
}
function publicationFromText(text: string): string {
  return (text.match(/(?:Chinese Optics Letters|Optics Express|Optics Letters|Journal of Optical Communications and Networking|Applied Optics|Biomedical Optics Express|Optica|Photonics Research|Journal of the Optical Society of America [AB])/i)?.[0] || "").trim();
}

export function parseOpticaItemsFromHtml(html: string): OpticaItem[] {
  const source = String(html || "");
  const checkboxMatches = [...source.matchAll(/<input[^>]+name=["']articles["'][^>]+value=["']([^"']+)["'][^>]*>/gi)];
  return checkboxMatches.map((match, index) => {
    const article_id = match[1];
    const start = Math.max(0, match.index || 0);
    const end = index + 1 < checkboxMatches.length ? (checkboxMatches[index + 1].index || source.length) : Math.min(source.length, start + 8000);
    const block = source.slice(start, end);
    const text = cleanText(block);
    const doi = doiFromText(text);
    const title = cleanText(/<(?:h\d|a|span)[^>]+class=["'][^"']*(?:art_title|article-title|hlFld-Title|title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h\d|a|span)>/i.exec(block)?.[1] || /<a[^>]+href=["'][^"']*(?:abstract|fulltext|doi)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "") || text.split(/\s+10\.1364\//)[0].slice(0, 180);
    const rest = text.replace(title, "");
    return { title, authors: authorsFromText(rest), doi, publication: publicationFromText(rest), year: yearFromText(rest), article_id };
  }).filter((item) => item.article_id || item.title || item.doi).slice(0, 100);
}

export function parseOpticaItemsFromVisibleText(text: string): OpticaItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const pieces = normalized.split(/\s+(?=\d+\.\s+)/).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const year = yearFromText(beforeDoi);
    const publication = publicationFromText(beforeDoi);
    const title = beforeDoi.replace(/^\d+\.\s+/, "").split(/\s+(?:[A-Z][a-z]+\s+[A-Z][a-z]+|Chinese Optics Letters|Optics Express|Optics Letters|20\d{2})/)[0].trim();
    const authorPart = beforeDoi.slice(title.length).trim();
    return { title, authors: authorsFromText(authorPart), doi, publication, year, article_id: "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readOpticaPage(page: any): Promise<{ visibleText: string; title: string; html: string; resultCount: number; totalCount: number; items: OpticaItem[] }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const counts = parseOpticaResultCounts(visibleText);
      const items = parseOpticaItemsFromHtml(html);
      stable = { visibleText, title, html, resultCount: counts.result_count, totalCount: counts.total_count, items: items.length ? items : parseOpticaItemsFromVisibleText(visibleText) };
      if (counts.result_count === lastCount) break;
      lastCount = counts.result_count;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
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

async function withAllocatedOpticaPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Optica tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function applyOpticaYearFacet(page: any, year: number): Promise<void> {
  const found = await page.evaluate((targetYear: number) => {
    const inputs = Array.from(document.querySelectorAll('input[name="chkFacet-year"]')) as HTMLInputElement[];
    const input = inputs.find((el) => el.getAttribute("data-value") === String(targetYear));
    return input ? { id: input.id, checked: input.checked } : null;
  }, year).catch(() => null);
  if (!found?.id) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica year facet input was not found", { year, selector: 'input[name="chkFacet-year"]' });
  await page.locator(`label[for="${found.id}"]`).click({ timeout: 10000 });
  for (let i = 0; i < 5; i++) {
    const checked = await page.evaluate((id: string) => (document.getElementById(id) as HTMLInputElement | null)?.checked === true, found.id).catch(() => false);
    if (checked) break;
    await sleep(500);
  }
  const checked = await page.evaluate((id: string) => (document.getElementById(id) as HTMLInputElement | null)?.checked === true, found.id).catch(() => false);
  if (!checked) throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Optica year facet checkbox did not become checked", { year, id: found.id });
  await page.locator("#more-all-year").click({ timeout: 10000 });
  for (let i = 0; i < 5; i++) {
    const visible = await page.locator("#apply-all-year").isVisible().catch(() => false);
    if (visible) break;
    await sleep(500);
  }
  const apply = page.locator("#apply-all-year");
  if (!await apply.isVisible().catch(() => false)) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica year facet Apply Filters button was not visible", { selector: "#apply-all-year" });
  await apply.click({ timeout: 10000 });
  for (let i = 0; i < 6; i++) {
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    if (/Clear Facets/i.test(text)) return;
    await sleep(3000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Optica year refine did not expose Clear Facets within bounded polling", { year });
}

export async function researchOpticaSearch(args: OpticaSearchArgs): Promise<{ result_count: number; total_count: number; items: OpticaItem[]; query_url: string }> {
  const query_url = buildOpticaSearchUrl(args);
  const profile = args.profile || "research-optica";
  const tabId = args.tab_id || `research-optica-search-${Date.now()}`;
  const page = await withAllocatedOpticaPage(profile, query_url, tabId, args.cdp_port, (p) => readOpticaPage(p));
  return { result_count: page.resultCount, total_count: page.totalCount, items: page.items, query_url };
}

export async function researchOpticaFilter(args: OpticaFilterArgs): Promise<{ result_count: number; total_count: number; items: OpticaItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildOpticaFilterUrl(args);
  const profile = args.profile || "research-optica";
  const tabId = args.tab_id || `research-optica-filter-${Date.now()}`;
  const page = await withAllocatedOpticaPage(profile, refined_url, tabId, args.cdp_port, async (p) => {
    const before = await readOpticaPage(p);
    if (args.year) await applyOpticaYearFacet(p, Number(args.year));
    const after = await readOpticaPage(p);
    if (args.year && after.resultCount > before.resultCount) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Optica year refine increased result count", { before: before.resultCount, after: after.resultCount, year: args.year });
    return after;
  });
  return { result_count: page.resultCount, total_count: page.totalCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchOpticaExport(args: OpticaExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: OpticaExportFormat; article_id: string }> {
  const query_url = buildOpticaSearchUrl(args);
  const articleId = requireArticleId(args.article_id);
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-optica";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "optica"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-optica-export-${Date.now()}`;
  return await withAllocatedOpticaPage(profile, query_url, tabId, args.cdp_port, async (page) => {
    try {
      await readOpticaPage(page);
      const checkbox = page.locator(`input[name="articles"][value="${articleId}"]`);
      if (!await checkbox.count().catch(() => 0)) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica export article checkbox was not found", { article_id: articleId });
      if (!await checkbox.isChecked().catch(() => false)) await checkbox.click({ timeout: 10000 });
      const checked = await checkbox.isChecked().catch(() => false);
      if (!checked) throw new WebAiToolError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "Optica export article checkbox did not become checked", { article_id: articleId });
      await page.locator("#actionsDropdown a.dropdown-toggle").click({ timeout: 10000 });
      for (let i = 0; i < 5; i++) {
        if (await page.locator("#citation-dropdown.dropdown-menu.show").count().catch(() => 0)) break;
        await sleep(500);
      }
      const buttonSelector = format === "bibtex" ? '#citation-dropdown a[onclick*="export_bibtex"]' : '#citation-dropdown a[onclick*="export_endnote"]';
      if (!await page.locator(buttonSelector).count().catch(() => 0)) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Optica citation export menu item was not found", { selector: buttonSelector });
      const clicked = await runArtifactClick({
        profile,
        tabUrlContains: "opg.optica.org",
        buttonSelector,
        downloadDir,
        timeoutMs: 90000,
        locateTimeoutMs: 15000,
        frameMinCount: 0,
        filenamePattern: format === "bibtex" ? "*.bib" : "*.ris"
      });
      const artifact_path = clicked.path;
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!/^@article\{/m.test(text) || !text.includes(articleId.replace(/-/g, ":").split(":")[0]))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Optica BibTeX artifact failed content validation", { artifact_path, article_id: articleId });
      }
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Optica RIS artifact failed content validation", { artifact_path, article_id: articleId });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, article_id: articleId };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED;
      throw new WebAiToolError(code, "Optica export failed", { article_id: articleId, format, cause: error?.message || String(error) });
    }
  });
}
