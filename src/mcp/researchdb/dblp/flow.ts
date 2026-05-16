const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type DblpSearchMode = "combined" | "author" | "venue" | "publ";
export type DblpExportFormat = "bibtex" | "xml" | "json";

export interface DblpItem { key: string; title: string; authors: string[]; venue: string; year: number | null; type: string; url: string; bibtex_url: string; }
export interface DblpSearchArgs { query: string; mode?: DblpSearchMode | string; profile?: string; cdp_port?: number; tab_id?: string; }
export interface DblpFilterArgs extends DblpSearchArgs { refine_token?: string; type?: string; year?: number; author_token?: string; venue_token?: string; access_token?: string; }
export interface DblpExportArgs { key?: string; query?: string; format?: DblpExportFormat | string; bulk?: boolean; h?: number; filename?: string; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const DBLP_ORIGIN = "https://dblp.org";
const VALID_MODES = new Set(["combined", "author", "venue", "publ"]);
const VALID_FORMATS = new Set(["bibtex", "xml", "json"]);

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function requireQuery(query?: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "DBLP query is required");
  const cleaned = query.trim();
  if (/[\".-]/.test(cleaned)) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "DBLP CompleteSearch disables phrase and NOT syntax; use prefix/exact word, space AND, or pipe OR only", { query });
  }
  return cleaned;
}
function normalizeMode(mode?: string): DblpSearchMode {
  const out = mode || "combined";
  if (!VALID_MODES.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported DBLP search mode: ${mode}`, { mode, valid: [...VALID_MODES] });
  return out as DblpSearchMode;
}
function normalizeFormat(format?: string, bulk?: boolean): DblpExportFormat {
  const out = (format || (bulk ? "xml" : "bibtex")).toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported DBLP export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as DblpExportFormat;
}
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireKey(key?: string): string {
  const out = String(key || "").trim().replace(/^https?:\/\/dblp\.org\/rec\//i, "").replace(/\.(?:html|bib|xml|rdf|ttl|nt)$/i, "");
  if (!out || !/^[A-Za-z0-9][A-Za-z0-9_./:-]+$/.test(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "A valid DBLP record key is required", { key });
  return out;
}
function safeFileToken(value: string): string { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "dblp"; }
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
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function authorsFromText(text: string): string[] { return String(text || "").split(/,| and /).map((s) => s.trim()).filter(Boolean).slice(0, 20); }
function modePath(mode?: string): string {
  switch (normalizeMode(mode)) {
    case "author": return "/search/author";
    case "venue": return "/search/venue";
    case "publ": return "/search/publ";
    default: return "/search";
  }
}
function appendToken(query: string, token?: string): string {
  const cleaned = String(token || "").trim();
  return cleaned ? `${query} ${cleaned}` : query;
}

export function buildDblpSearchUrl(args: DblpSearchArgs): string {
  const url = new URL(modePath(args.mode), DBLP_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  return url.toString();
}

export function buildDblpFilterUrl(args: DblpFilterArgs): string {
  let query = requireQuery(args.query);
  query = appendToken(query, args.refine_token);
  query = appendToken(query, args.type ? `type:${args.type}:` : undefined);
  query = appendToken(query, args.year ? `year:${asPositiveInt(args.year, "year")}:` : undefined);
  query = appendToken(query, args.author_token);
  query = appendToken(query, args.venue_token);
  query = appendToken(query, args.access_token);
  return buildDblpSearchUrl({ query, mode: args.mode });
}

export function buildDblpBibtexUrl(key: string): string {
  return new URL(`/rec/${requireKey(key)}.bib`, DBLP_ORIGIN).toString();
}

export function buildDblpBulkApiUrl(args: { query: string; format?: "xml" | "json" | string; h?: number; mode?: DblpSearchMode | string }): string {
  const format = (args.format || "xml").toLowerCase();
  if (!new Set(["xml", "json"]).has(format)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "DBLP bulk API supports clean xml/json formats; /bibtex is an HTML embedding page", { format: args.format });
  const mode = normalizeMode(args.mode);
  const apiPath = mode === "author" ? "/search/author/api" : mode === "venue" ? "/search/venue/api" : "/search/publ/api";
  const url = new URL(apiPath, DBLP_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("h", String(asPositiveInt(args.h, "h") || 1000));
  url.searchParams.set("format", format);
  return url.toString();
}

export function parseDblpResultCount(text: string): number {
  const raw = /found\s+([\d,]+)\s+matches/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "DBLP result count node was not found", { probe: "p#completesearch-info-matches" });
  return Number(raw.replace(/,/g, ""));
}

export function parseDblpItemsFromHtml(html: string): DblpItem[] {
  const blocks = [...String(html || "").matchAll(/<li\b[^>]*class=["'][^"']*\bentry\b[^"']*["'][^>]*>([\s\S]*?)(?=<li\b[^>]*class=["'][^"']*\bentry\b|<\/ul>|$)/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const key = /<li\b[^>]*\bid=["']([^"']+)["']/i.exec(block)?.[1] || "";
    const classText = /<li\b[^>]*\bclass=["']([^"']+)["']/i.exec(block)?.[1] || "";
    const title = cleanText(/<span\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] || "") || cleanText(block).slice(0, 260);
    const authorsBlock = /<span\b[^>]*class=["'][^"']*\bauthors\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] || "";
    const venue = cleanText(/<span\b[^>]*class=["'][^"']*\b(?:venue|publisher)\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] || "");
    const text = cleanText(block);
    return { key, title, authors: authorsFromText(cleanText(authorsBlock)), venue, year: yearFromText(text), type: classText.split(/\s+/).find((c) => /^(article|inproceedings|book|phdthesis|mastersthesis|data)$/i.test(c)) || "", url: key ? new URL(`/rec/${key}`, DBLP_ORIGIN).toString() : "", bibtex_url: key ? buildDblpBibtexUrl(key) : "" };
  }).filter((item) => item.key || item.title).slice(0, 100);
}

export function parseDblpItemsFromVisibleText(text: string): DblpItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const pieces = normalized.split(/\b(?:export record|Electronic Edition|URL)\b/i).filter((piece) => /\b(19\d{2}|20\d{2})\b/.test(piece));
  return pieces.map((piece) => {
    const year = yearFromText(piece);
    const title = piece.split(/\s+(?:[A-Z][a-z]+\s+[A-Z][a-z]+,|[A-Z]\.|\b19\d{2}\b|\b20\d{2}\b)/)[0].trim().slice(0, 260);
    return { key: "", title, authors: [], venue: "", year, type: "", url: "", bibtex_url: "" };
  }).filter((item) => item.title).slice(0, 100);
}

async function readDblpPage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: DblpItem[]; facets: string[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 24; i++) {
    try {
      const observed = await page.evaluate(() => ({
        visibleText: document.body?.innerText || "",
        title: document.title || "",
        html: document.documentElement?.outerHTML || "",
        url: location.href,
        countText: document.querySelector("p#completesearch-info-matches")?.textContent || "",
        itemCount: document.querySelectorAll("ul.publ-list li.entry").length,
        facets: Array.from(document.querySelectorAll("#completesearch-facets div.refine-by")).map((el) => Array.from(el.classList).join("."))
      }));
      const resultCount = parseDblpResultCount(observed.countText || observed.visibleText);
      const items = parseDblpItemsFromHtml(observed.html);
      stable = { visibleText: observed.visibleText, title: observed.title, html: observed.html, url: observed.url, resultCount, items: items.length ? items : parseDblpItemsFromVisibleText(observed.visibleText), facets: observed.facets };
      if (observed.itemCount > 0 && resultCount > 0) break;
    } catch (error) { lastError = error; }
    await sleep(500);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "DBLP results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedDblpPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "DBLP tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchDblpSearch(args: DblpSearchArgs): Promise<{ result_count: number; items: DblpItem[]; query_url: string; confirm_title: string; facets: string[] }> {
  const query_url = buildDblpSearchUrl(args);
  const profile = args.profile || "nuaa-dblp";
  const tabId = args.tab_id || `research-dblp-search-${Date.now()}`;
  const page = await withAllocatedDblpPage(profile, query_url, tabId, args.cdp_port, (p) => readDblpPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, confirm_title: page.title, facets: page.facets };
}

export async function researchDblpFilter(args: DblpFilterArgs): Promise<{ result_count: number; items: DblpItem[]; refined_url: string; confirm_url: string; confirm_title: string; facets: string[] }> {
  const refined_url = buildDblpFilterUrl(args);
  const profile = args.profile || "nuaa-dblp";
  const tabId = args.tab_id || `research-dblp-filter-${Date.now()}`;
  const page = await withAllocatedDblpPage(profile, refined_url, tabId, args.cdp_port, (p) => readDblpPage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title, facets: page.facets };
}

export async function researchDblpExport(args: DblpExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: DblpExportFormat; source_url: string; key?: string; query?: string; mime_type: string | null }> {
  const format = normalizeFormat(args.format, args.bulk);
  const bulk = Boolean(args.bulk || args.query);
  if (!bulk && format !== "bibtex") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "DBLP per-entry export is verified for BibTeX; use bulk=true for xml/json API", { format });
  const source_url = bulk ? buildDblpBulkApiUrl({ query: requireQuery(args.query), format, h: args.h }) : buildDblpBibtexUrl(requireKey(args.key));
  const profile = args.profile || "nuaa-dblp";
  const tabId = args.tab_id || `research-dblp-export-${Date.now()}`;
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "dblp"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  return await withAllocatedDblpPage(profile, DBLP_ORIGIN, tabId, args.cdp_port, async (page) => {
    try {
      const response = await page.request.get(source_url, { timeout: 60000 });
      if (!response.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "DBLP download-url returned a non-OK status", { status: response.status?.(), source_url });
      const headers = response.headers?.() || {};
      const body = Buffer.from(await response.body());
      const key = args.key ? requireKey(args.key) : undefined;
      const ext = format === "bibtex" ? "bib" : format;
      const filename = args.filename || (key ? `dblp-${safeFileToken(key)}.${ext}` : `dblp-search.${ext}`);
      const artifact_path = uniquePath(downloadDir, filename);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "bibtex" && (!key || !new RegExp(`^@\\w+\\{DBLP:${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`, "m").test(text))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "DBLP BibTeX artifact failed content validation", { artifact_path, key });
      }
      if (format === "xml" && !/<\?xml|<result/i.test(text)) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "DBLP XML artifact failed content validation", { artifact_path });
      if (format === "json") JSON.parse(text);
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, source_url, key, query: args.query, mime_type: headers["content-type"] || null };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "DBLP export failed", { source_url, cause: error?.message || String(error) });
    }
  });
}
