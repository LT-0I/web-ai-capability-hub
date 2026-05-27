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

export type IeeeField = "All Metadata" | "Full Text & Metadata" | "Full Text Only" | "Document Title" | "Authors" | "Publication Title" | "Abstract" | "Index Terms" | "Accession Number" | "Article Number" | "Article Page Number";
export type IeeeBoolean = "AND" | "OR" | "NOT";
export type IeeeContentType = "Conferences" | "Journals" | "Early Access Articles" | "Magazines" | "Books";
export type IeeeExportFormat = "ris" | "bibtex" | "csv";

export interface IeeeTerm { term: string; field?: IeeeField | string; operator?: IeeeBoolean | string; }
export interface IeeeItem { title: string; authors: string[]; publication: string; year: number | null; doi: string; }
export interface IeeeSearchArgs { query: string; field?: IeeeField | string; terms?: IeeeTerm[]; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface IeeeFilterArgs extends IeeeSearchArgs { content_type?: IeeeContentType | string; refinements?: string[]; }
export interface IeeeExportArgs extends IeeeFilterArgs { format?: IeeeExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const IEEE_ORIGIN = "https://ieeexplore.ieee.org";
const VALID_FIELDS = new Set(["All Metadata", "Full Text & Metadata", "Full Text Only", "Document Title", "Authors", "Publication Title", "Abstract", "Index Terms", "Accession Number", "Article Number", "Article Page Number"]);
const VALID_BOOLEANS = new Set(["AND", "OR", "NOT"]);
const VALID_CONTENT_TYPES = new Set(["Conferences", "Journals", "Early Access Articles", "Magazines", "Books"]);
const VALID_FORMATS = new Set(["ris", "bibtex", "csv"]);
const FORMAT_TO_DOWNLOAD: Record<Exclude<IeeeExportFormat, "csv">, string> = { ris: "download-ris", bibtex: "download-bibtex" };
const FORMAT_TO_EXTENSION: Record<IeeeExportFormat, string> = { ris: "ris", bibtex: "bib", csv: "csv" };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "ieee"; }
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
function normalizeField(field?: string): IeeeField {
  const out = field || "All Metadata";
  if (!VALID_FIELDS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEEE search field: ${out}`, { field, valid: [...VALID_FIELDS] });
  return out as IeeeField;
}
function normalizeBoolean(operator?: string): IeeeBoolean {
  const out = (operator || "AND").toUpperCase();
  if (!VALID_BOOLEANS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEEE boolean operator: ${operator}`, { operator, valid: [...VALID_BOOLEANS] });
  return out as IeeeBoolean;
}
function normalizeContentType(contentType?: string): IeeeContentType | undefined {
  if (!contentType) return undefined;
  if (!VALID_CONTENT_TYPES.has(contentType)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEEE content type: ${contentType}`, { content_type: contentType, valid: [...VALID_CONTENT_TYPES] });
  return contentType as IeeeContentType;
}
function normalizeFormat(format?: string): IeeeExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported IEEE export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as IeeeExportFormat;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function quoteQueryTerm(value: string): string {
  const trimmed = requireQuery(value);
  return /\s/.test(trimmed) && !/^".*"$/.test(trimmed) ? trimmed : trimmed;
}
function buildQueryText(args: IeeeSearchArgs): string {
  const terms = args.terms?.length ? args.terms : [{ term: args.query, field: args.field }];
  return terms.map((term, index) => {
    const field = normalizeField(term.field || args.field);
    const expression = `("${field}":${quoteQueryTerm(term.term)})`;
    if (index === 0) return expression;
    return `${normalizeBoolean(term.operator)} ${expression}`;
  }).join(" ");
}

export function buildIeeeSearchUrl(args: IeeeSearchArgs): string {
  const url = new URL("/search/searchresult.jsp", IEEE_ORIGIN);
  url.searchParams.set("action", "search");
  url.searchParams.set("newsearch", "true");
  url.searchParams.set("matchBoolean", "true");
  url.searchParams.set("queryText", buildQueryText(args));
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) url.searchParams.set("rowsPerPage", String(pageSize));
  return url.toString();
}

function ieeeRefinements(args: IeeeFilterArgs): string[] {
  const refinements = [...(args.refinements || [])];
  const contentType = normalizeContentType(args.content_type);
  if (contentType) refinements.push(`ContentType:${contentType}`);
  for (const refinement of refinements) {
    if (!refinement || !refinement.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "refinement values must be non-empty", { refinements });
  }
  return refinements.map((refinement) => refinement.trim());
}

export function buildIeeeFilterUrl(args: IeeeFilterArgs): string {
  const url = new URL(buildIeeeSearchUrl(args));
  for (const refinement of ieeeRefinements(args)) url.searchParams.append("refinements", refinement);
  return url.toString();
}

export function buildIeeeRestSearchPayload(args: IeeeFilterArgs): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    action: "search",
    newsearch: true,
    matchBoolean: true,
    queryText: buildQueryText(args),
    highlight: true,
    returnFacets: ["ALL"],
    returnType: "SEARCH",
    matchPubs: true
  };
  const pageSize = asPositiveInt(args.page_size, "page_size");
  if (pageSize) payload.rowsPerPage = String(pageSize);
  const refinements = ieeeRefinements(args);
  if (refinements.length) payload.refinements = refinements;
  return payload;
}

export function parseIeeeResultCount(text: string): number {
  const raw = /Showing\s+1-\d+\s+of\s+([\d,]+)/i.exec(text || "")?.[1]
    || /Showing\s+\d+\s+-\s+\d+\s+of\s+([\d,]+)/i.exec(text || "")?.[1]
    || /of\s+([\d,]+)\s+results/i.exec(text || "")?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEEE result count node was not found", { probe: "Showing 1-N of M" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.1109\/[^\s<]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforePublication = text.split(/\b(?:IEEE|Proceedings|Journal|Transactions|Conference|Symposium|Magazine)\b/i)[0] || "";
  return beforePublication.split(/;|,| and /).map((s) => s.trim()).filter((s) => s && !/^(Abstract|PDF|HTML|CrossRef|PubMed|Google Scholar|More Like This)$/i.test(s)).slice(0, 12);
}

export function parseIeeeItemsFromHtml(html: string): IeeeItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<[^>]+class=["'][^"']*(?:List-results-items|xpl-results-item|result-item)[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*(?:List-results-items|xpl-results-item|result-item)[^"']*["']|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const title = cleanText(/<h\d[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h\d>/i.exec(block)?.[1] || /<a[^>]+class=["'][^"']*(?:fw-bold|title)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "");
    const text = cleanText(block).replace(title, "");
    const doi = doiFromText(text);
    const year = yearFromText(text);
    const publication = (text.match(/(?:IEEE [A-Za-z0-9 &:-]+|Proceedings of [A-Za-z0-9 &:-]+|[A-Za-z0-9 &:-]+ Conference[A-Za-z0-9 &:-]*)/)?.[0] || "").trim();
    return { title, authors: authorsFromText(text), publication, year, doi };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseIeeeItemsFromVisibleText(text: string): IeeeItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Showing\s+1-\d+\s+of\s+[\d,]+/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=(?:\[HTML\]|\[PDF\]|Article|Conference Paper|Early Access Article)\s+)/i).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const year = yearFromText(piece);
    const title = piece.replace(/^(?:\[HTML\]|\[PDF\]|Article|Conference Paper|Early Access Article)\s+/i, "").split(/\s+(?:Abstract:|Published in:|Date of Publication:|DOI:)/i)[0].trim();
    const publication = (/Published in:\s*([^|]+?)(?:\s+Date of Publication:|\s+DOI:|$)/i.exec(piece)?.[1] || "").trim();
    const authorPart = piece.slice(title.length).split(/Published in:|Abstract:|Date of Publication:|DOI:/i)[0] || "";
    return { title, authors: authorsFromText(authorPart), publication, year, doi };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readIeeePage(page: any): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: IeeeItem[] }> {
  let stable: any;
  let lastCount = -1;
  let lastError: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const resultCount = parseIeeeResultCount(visibleText);
      const items = parseIeeeItemsFromHtml(html);
      stable = { visibleText, title, html, url: page.url?.() || "", resultCount, items: items.length ? items : parseIeeeItemsFromVisibleText(visibleText) };
      if (resultCount === lastCount) break;
      lastCount = resultCount;
    } catch (error) { lastError = error; }
    await sleep(3000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEEE results page did not hydrate", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedIeeePage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "IEEE tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

export async function researchIeeeSearch(args: IeeeSearchArgs): Promise<{ result_count: number; items: IeeeItem[]; query_url: string }> {
  const query_url = buildIeeeSearchUrl(args);
  const profile = args.profile || "research-default";
  const tabId = args.tab_id || `research-ieee-search-${Date.now()}`;
  const page = await withAllocatedIeeePage(profile, query_url, tabId, args.cdp_port, (p) => readIeeePage(p));
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchIeeeFilter(args: IeeeFilterArgs): Promise<{ result_count: number; items: IeeeItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildIeeeFilterUrl(args);
  const profile = args.profile || "research-default";
  const tabId = args.tab_id || `research-ieee-filter-${Date.now()}`;
  const page = await withAllocatedIeeePage(profile, refined_url, tabId, args.cdp_port, (p) => readIeeePage(p));
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

export async function researchIeeeExport(args: IeeeExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: IeeeExportFormat }> {
  const format = normalizeFormat(args.format);
  requireQuery(args.query);
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "ieee"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const profile = args.profile || "research-default";
  const tabId = args.tab_id || `research-ieee-export-${Date.now()}`;
  return await withAllocatedIeeePage(profile, IEEE_ORIGIN, tabId, args.cdp_port, async (page) => {
    const query_url = buildIeeeFilterUrl(args);
    try {
      const searchResponse = await page.request.post(new URL("/rest/search", IEEE_ORIGIN).toString(), {
        data: { ...buildIeeeRestSearchPayload({ ...args, page_size: 1 }), rowsPerPage: "1" },
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Referer": query_url
        },
        timeout: 60000
      });
      if (!searchResponse.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IEEE REST search returned a non-OK status", { status: searchResponse.status?.(), query_url });
      const searchJson = await searchResponse.json().catch(async () => ({ raw: await searchResponse.text().catch(() => "") }));
      const record = Array.isArray(searchJson?.records) ? searchJson.records.find((item: any) => item?.articleNumber) : undefined;
      if (!record?.articleNumber) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEEE REST search did not return an articleNumber", { query_url, keys: Object.keys(searchJson || {}) });
      const articleNumber = String(record.articleNumber);
      let body: Buffer;
      let source_url: string;
      if (format === "csv") {
        source_url = new URL("/rest/search/export-csv", IEEE_ORIGIN).toString();
        const csvResponse = await page.request.post(source_url, {
          data: { ...buildIeeeRestSearchPayload(args), documentIds: [articleNumber] },
          headers: {
            "Accept": "text/csv,text/plain,*/*",
            "Content-Type": "application/json",
            "Referer": query_url
          },
          timeout: 60000
        });
        if (!csvResponse.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IEEE CSV export returned a non-OK status", { status: csvResponse.status?.(), source_url, articleNumber });
        body = Buffer.from(await csvResponse.body());
      } else {
        source_url = new URL("/rest/search/citation/format", IEEE_ORIGIN).toString();
        const citationResponse = await page.request.post(source_url, {
          data: { recordIds: [articleNumber], "download-format": FORMAT_TO_DOWNLOAD[format], lite: true },
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Referer": query_url
          },
          timeout: 60000
        });
        if (!citationResponse.ok?.()) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "IEEE citation export returned a non-OK status", { status: citationResponse.status?.(), source_url, articleNumber });
        const citationJson = await citationResponse.json().catch(async () => ({ data: await citationResponse.text().catch(() => "") }));
        const text = typeof citationJson?.data === "string" ? citationJson.data : "";
        if (!text) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "IEEE citation export response did not include data", { source_url, articleNumber, keys: Object.keys(citationJson || {}) });
        body = Buffer.from(text, "utf-8");
      }
      const artifact_path = uniquePath(downloadDir, `ieee-${safeFileToken(articleNumber)}-${format}.${FORMAT_TO_EXTENSION[format]}`);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      const doi = String(record.doi || "");
      const valid = format === "ris"
        ? /^TY\s+-/m.test(text) && /^ER\s+-/m.test(text) && (!doi || text.includes(doi))
        : format === "bibtex"
          ? /^@/m.test(text) && (!doi || text.includes(doi))
          : text.length > 0 && (text.includes(articleNumber) || !doi || text.includes(doi));
      if (!valid) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "IEEE citation artifact failed content validation", { artifact_path, format, articleNumber, doi });
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "IEEE export failed", { format, query_url, cause: error?.message || String(error) });
    }
  });
}
