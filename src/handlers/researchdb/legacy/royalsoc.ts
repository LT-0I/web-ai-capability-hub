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

export type RoyalSocFacetKind = "journal" | "article_type" | "subject" | "issue_section";
export type RoyalSocExportFormat = "ris" | "endnote" | "bibtex" | "refworks";

export interface RoyalSocItem { title: string; authors: string[]; doi: string; publication: string; year: number | null; article_url: string; resource_id?: string; journal_prefix?: string; }
export interface RoyalSocSearchArgs { query: string; page?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface RoyalSocFilterArgs extends RoyalSocSearchArgs { journal?: string; article_type?: string; subject_id?: string | number; issue_section?: string; }
export interface RoyalSocExportArgs { doi?: string; resource_id?: string | number; format?: RoyalSocExportFormat; download_dir?: string; profile?: string; cdp_port?: number; tab_id?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const ROYALSOC_ORIGIN = "https://royalsocietypublishing.org";
const VALID_FORMATS = new Set(["ris", "endnote", "bibtex", "refworks"]);
const FORMAT_TO_CITATION: Record<RoyalSocExportFormat, number> = { ris: 0, endnote: 1, bibtex: 2, refworks: 3 };
const FORMAT_TO_EXTENSION: Record<RoyalSocExportFormat, string> = { ris: "ris", endnote: "enw", bibtex: "bib", refworks: "ris" };
const FACET_PARAMS: Record<RoyalSocFacetKind, string> = {
  journal: "f_JournalDisplayName",
  article_type: "f_ArticleTypeDisplayName",
  subject: "f_FacetCategoryIDs_1",
  issue_section: "f_TocHeadingTitle"
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
function normalizeFormat(format?: string): RoyalSocExportFormat {
  const out = (format || "ris").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Royal Society export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as RoyalSocExportFormat;
}
function requireDoi(doi?: string): string {
  if (!doi || !doi.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "doi is required unless resource_id is supplied");
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
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
function doiFromText(text: string): string { return (/10\.1098\/[A-Za-z0-9.\-_/]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const cleaned = text.replace(/\b(?:Open Access|View Article|Published|Article Type|Issue|Volume|Royal Society)\b.*$/i, "");
  return cleaned.split(/,|;| and /).map((s) => s.trim()).filter((s) => s && !/^(JOURNAL ARTICLES?|Research article|Free)$/i.test(s)).slice(0, 12);
}
function normalizeFacetValue(value: string): string { return value.replace(/_/g, " ").trim(); }
function safeFileToken(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "royalsoc"; }
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
function absoluteRoyalSocUrl(href: string): string { return new URL(href, ROYALSOC_ORIGIN).toString(); }
function resourceIdFromArticleUrl(url: string): string {
  const match = /\/article(?:-abstract)?\/[^?#]+\/(\d+)(?:\/|\?|$)/i.exec(url || "");
  if (!match) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Royal Society resourceId was not found in article URL", { url });
  return match[1];
}
function journalPrefixFromArticleUrl(url: string): string | undefined { return /^https?:\/\/[^/]+\/([^/]+)\//i.exec(url || "")?.[1] || /^\/([^/]+)\//.exec(url || "")?.[1]; }
function isCloudflareInterstitial(title: string, html: string, visibleText = ""): boolean {
  const haystack = `${title || ""}\n${visibleText || ""}\n${html || ""}`;
  return /(?:Just a moment|Attention Required|cf-challenge|cf-browser-verification|cf-turnstile|challenge-platform|cloudflare)/i.test(haystack);
}

export function buildRoyalSocSearchUrl(args: RoyalSocSearchArgs): string {
  const url = new URL("/search-results", ROYALSOC_ORIGIN);
  url.searchParams.set("q", requireQuery(args.query));
  url.searchParams.set("hd", "advancedAny");
  url.searchParams.set("searchType", "advanced");
  const page = asPositiveInt(args.page, "page");
  if (page) url.searchParams.set("page", String(page));
  return url.toString();
}

export function buildRoyalSocFilterUrl(args: RoyalSocFilterArgs): string {
  const url = new URL(buildRoyalSocSearchUrl(args));
  url.searchParams.delete("searchType");
  url.searchParams.set("fl_SiteID", "1");
  url.searchParams.set("page", String(asPositiveInt(args.page, "page") || 1));
  if (args.journal) url.searchParams.set(FACET_PARAMS.journal, normalizeFacetValue(args.journal));
  if (args.article_type) url.searchParams.set(FACET_PARAMS.article_type, normalizeFacetValue(args.article_type));
  if (args.subject_id !== undefined && args.subject_id !== null) url.searchParams.set(FACET_PARAMS.subject, String(args.subject_id));
  if (args.issue_section) url.searchParams.set(FACET_PARAMS.issue_section, normalizeFacetValue(args.issue_section));
  return url.toString();
}

export function buildRoyalSocCitationDownloadUrl(resourceId: string | number, format?: string): string {
  if (resourceId === undefined || resourceId === null || String(resourceId).trim() === "") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "resource_id is required");
  const normalized = normalizeFormat(format);
  const url = new URL("/Citation/Download", ROYALSOC_ORIGIN);
  url.searchParams.set("resourceId", String(resourceId));
  url.searchParams.set("resourceType", "3");
  url.searchParams.set("citationFormat", String(FORMAT_TO_CITATION[normalized]));
  return url.toString();
}

export function parseRoyalSocDerivedResultCount(html: string): number {
  const body = String(html || "");
  const itemCount = (body.match(/class=["'][^"']*sr-list[^"']*al-article-box[^"']*["']/gi) || []).length;
  const pageNumbers = [...body.matchAll(/class=["'][^"']*al-pageNumber[^"']*["'][^>]*data-url=["'][^"']*page=(\d+)/gi)].map((m) => Number(m[1])).filter(Boolean);
  const maxPage = pageNumbers.length ? Math.max(...pageNumbers) : 1;
  if (itemCount > 0 && maxPage > 1) return Math.max(itemCount, (maxPage - 1) * 20 + itemCount);
  return itemCount;
}

export function parseRoyalSocItemsFromHtml(html: string): RoyalSocItem[] {
  const body = String(html || "");
  const blocks = [...body.matchAll(/<[^>]+class=["'][^"']*sr-list[^"']*al-article-box[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*sr-list[^"']*al-article-box|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const text = cleanText(block);
    const href = /<a[^>]+href=["']([^"']*\/article[^"']+)["'][^>]*>/i.exec(block)?.[1]?.replace(/&amp;/g, "&") || "";
    const article_url = href ? absoluteRoyalSocUrl(href) : "";
    const doi = doiFromText(text) || doiFromText(decodeURIComponent(article_url));
    const title = cleanText(/<a[^>]+(?:id=["']aria[^"']*["'][^>]*)?[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || "")
      || text.split(/\s+(?:Open Access|Published|https:\/\/doi\.org\/10\.1098\/)/i)[0].trim().slice(0, 260);
    const publication = (/\b(Philosophical Transactions of the Royal Society [AB]|Proceedings of the Royal Society [AB]|Journal of The Royal Society Interface|Royal Society Open Science|Biology Letters|Interface Focus|Notes and Records)\b/i.exec(text)?.[1] || "").trim();
    const authorPart = text.slice(title.length).split(/\b(?:Published|Article Type|https:\/\/doi\.org|Philosophical Transactions|Proceedings of the Royal Society|Journal of The Royal Society Interface|Royal Society Open Science|Biology Letters|Interface Focus|Notes and Records)\b/i)[0] || "";
    let resource_id: string | undefined;
    if (article_url) { try { resource_id = resourceIdFromArticleUrl(article_url); } catch { resource_id = undefined; } }
    return { title, authors: authorsFromText(authorPart), doi, publication, year: yearFromText(text), article_url, resource_id, journal_prefix: journalPrefixFromArticleUrl(article_url) };
  }).filter((item) => (item.title || item.doi || item.article_url) && !/^Search Dropdown Menu$/i.test(item.title)).slice(0, 100);
}

export function parseRoyalSocItemsFromVisibleText(text: string): RoyalSocItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const pieces = normalized.split(/\b(?:JOURNAL ARTICLES?|REVIEW ARTICLES?|Research articles?)\b/i).slice(1).filter((piece) => /10\.1098\//i.test(piece));
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const beforeDoi = doi ? piece.split(doi)[0] : piece;
    const title = beforeDoi.split(/\s+(?:Open Access|Published|Philosophical Transactions|Proceedings of the Royal Society|Journal of The Royal Society Interface|Royal Society Open Science|Biology Letters)\b/i)[0].trim().slice(0, 260);
    const publication = (/\b(Philosophical Transactions of the Royal Society [AB]|Proceedings of the Royal Society [AB]|Journal of The Royal Society Interface|Royal Society Open Science|Biology Letters|Interface Focus|Notes and Records)\b/i.exec(piece)?.[1] || "").trim();
    return { title, authors: authorsFromText(beforeDoi.slice(title.length)), doi, publication, year: yearFromText(piece), article_url: doi ? absoluteRoyalSocUrl(`/doi/${doi}`) : "" };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function readRoyalSocResultsPage(page: any): Promise<{ title: string; html: string; url: string; resultCount: number; items: RoyalSocItem[]; firstChildClass: string; }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 35; i++) {
    try {
      const observed = await page.evaluate(() => {
        const itemNodes = Array.from(document.querySelectorAll(".sr-list_wrap > .sr-list.al-article-box"));
        const firstChildClass = (document.querySelector(".sr-list_wrap")?.firstElementChild as HTMLElement | null)?.className || "";
        const html = document.documentElement.outerHTML;
        const visibleText = document.body?.innerText || "";
        return { html, visibleText, title: document.title, url: location.href, itemCount: itemNodes.length, firstChildClass };
      });
      if (isCloudflareInterstitial(observed.title, observed.html, observed.visibleText)) {
        lastError = new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Royal Society returned a Cloudflare managed challenge instead of article results", { url: observed.url, title: observed.title });
        break;
      }
      const items = parseRoyalSocItemsFromHtml(observed.html);
      const resultCount = parseRoyalSocDerivedResultCount(observed.html) || items.length;
      stable = { title: observed.title, html: observed.html, url: observed.url, resultCount, items: items.length ? items : parseRoyalSocItemsFromVisibleText(observed.visibleText), firstChildClass: observed.firstChildClass };
      if (observed.itemCount > 0 && /content-type-journal-article/i.test(observed.firstChildClass)) break;
      if (/content-type-journal\b/i.test(observed.firstChildClass) && !/content-type-journal-article/i.test(observed.firstChildClass)) {
        lastError = new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Royal Society query was not applied; journal tiles rendered instead of article results", { url: observed.url, firstChildClass: observed.firstChildClass });
      }
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable || !stable.items.length) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Royal Society results page did not hydrate article items", { cause: lastError instanceof Error ? lastError.message : String(lastError) });
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

async function withAllocatedRoyalSocPage<T>(profile: string, url: string, tabId: string, cdpPort: number | undefined, fn: (page: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateResearchSession(profile, url, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Royal Society tab allocation/navigation failed", { url, cause: error instanceof Error ? error.message : String(error) });
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

async function fetchRoyalSocCitationViaManagedPage(page: any, sourceUrl: string, downloadDir: string): Promise<Buffer> {
  const browser = page?.context?.()?.browser?.() || page?.browser?.();
  if (!browser?.newBrowserCDPSession) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Browser-level CDP session is required for Royal Society citation download");
  const session = await browser.newBrowserCDPSession();
  if (typeof session.send !== "function") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Browser.setDownloadBehavior is unavailable for Royal Society citation download");
  fs.mkdirSync(downloadDir, { recursive: true });
  const downloads = new Map<string, any>();
  session.on?.("Browser.downloadWillBegin", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event, will: true }));
  session.on?.("Browser.downloadProgress", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event }));
  await session.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true });

  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((error: any) => {
    const message = String(error?.message || error);
    if (!/download|ERR_ABORTED|net::ERR_ABORTED/i.test(message)) throw error;
  });

  const started = Date.now();
  let guid = "";
  while (Date.now() - started < 60000) {
    for (const [key, event] of downloads.entries()) {
      if (event?.will) { guid = key; break; }
    }
    if (guid) break;
    await sleep(100);
  }
  if (!guid) {
    const observed = await page.evaluate(() => ({ title: document.title, html: document.documentElement.outerHTML, visibleText: document.body?.innerText || "", url: location.href })).catch(() => undefined);
    if (observed && isCloudflareInterstitial(observed.title, observed.html, observed.visibleText)) {
      throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Royal Society citation download reached a Cloudflare managed challenge", { source_url: sourceUrl, url: observed.url, title: observed.title });
    }
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Royal Society citation download did not start", { source_url: sourceUrl });
  }

  const completedStarted = Date.now();
  while (Date.now() - completedStarted < 60000) {
    const event = downloads.get(guid);
    if (event?.state === "completed") {
      const filePath = path.join(downloadDir, guid);
      const body = fs.readFileSync(filePath);
      fs.unlinkSync(filePath);
      return body;
    }
    if (event?.state === "canceled") throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Royal Society citation download was canceled", { source_url: sourceUrl, guid });
    await sleep(100);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Royal Society citation download did not complete", { source_url: sourceUrl, guid });
}

export async function researchRoyalSocSearch(args: RoyalSocSearchArgs): Promise<{ result_count: number; items: RoyalSocItem[]; query_url: string; confirm_url: string; confirm_title: string }> {
  const query_url = buildRoyalSocSearchUrl(args);
  const profile = args.profile || "research-royalsoc";
  const tabId = args.tab_id || `research-royalsoc-search-${Date.now()}`;
  const page = await withAllocatedRoyalSocPage(profile, query_url, tabId, args.cdp_port, (p) => readRoyalSocResultsPage(p));
  return { result_count: page.resultCount, items: page.items, query_url, confirm_url: page.url, confirm_title: page.title };
}

export async function researchRoyalSocFilter(args: RoyalSocFilterArgs): Promise<{ result_count: number; items: RoyalSocItem[]; refined_url: string; confirm_url: string; confirm_title: string; filter_confirmed: boolean }> {
  const refined_url = buildRoyalSocFilterUrl(args);
  const profile = args.profile || "research-royalsoc";
  const tabId = args.tab_id || `research-royalsoc-filter-${Date.now()}`;
  const page = await withAllocatedRoyalSocPage(profile, refined_url, tabId, args.cdp_port, (p) => readRoyalSocResultsPage(p));
  const journalPrefixMap: Record<string, string> = {
    "journal of the royal society interface": "rsif",
    "philosophical transactions of the royal society a": "rsta",
    "philosophical transactions of the royal society b": "rstb",
    "proceedings of the royal society a": "rspa",
    "proceedings of the royal society b": "rspb",
    "royal society open science": "rsos",
    "biology letters": "rsbl",
    "interface focus": "rsfs",
    "notes and records": "rsnr"
  };
  const expectedPrefix = args.journal ? journalPrefixMap[args.journal.trim().toLowerCase()] : undefined;
  const prefixes = [...new Set(page.items.map((item: RoyalSocItem) => item.journal_prefix).filter(Boolean))];
  const filter_confirmed = args.journal
    ? page.items.length > 0 && (expectedPrefix ? page.items.every((item: RoyalSocItem) => item.journal_prefix === expectedPrefix) : prefixes.length === 1)
    : page.items.length > 0;
  if (!filter_confirmed) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Royal Society filter confirmation failed", { refined_url, expectedPrefix, prefixes });
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_url: page.url, confirm_title: page.title, filter_confirmed };
}

export async function researchRoyalSocExport(args: RoyalSocExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: RoyalSocExportFormat; doi?: string; resource_id: string; source_url: string }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-royalsoc";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "royalsoc"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const doi = args.doi ? requireDoi(args.doi) : undefined;
  const tabId = args.tab_id || `research-royalsoc-export-${Date.now()}`;
  const seedUrl = doi ? buildRoyalSocSearchUrl({ query: doi }) : ROYALSOC_ORIGIN;
  return await withAllocatedRoyalSocPage(profile, seedUrl, tabId, args.cdp_port, async (page) => {
    try {
      let resourceId = args.resource_id ? String(args.resource_id) : "";
      if (!resourceId) {
        await page.evaluate(() => {
          (document.querySelector("#onetrust-accept-btn-handler") as HTMLElement | null)?.click?.();
          (document.querySelector(".swal2-close") as HTMLElement | null)?.click?.();
        }).catch(() => undefined);
        const results = doi ? await readRoyalSocResultsPage(page) : undefined;
        const match = results?.items.find((item) => item.resource_id && (!doi || item.doi.toLowerCase() === doi.toLowerCase() || item.article_url.toLowerCase().includes(doi.toLowerCase())));
        resourceId = match?.resource_id || "";
        for (let i = 0; i < 20 && !resourceId; i++) {
          resourceId = await page.evaluate(() => (document.querySelector(".js-add-to-citation-download-manager[data-resource-id]") as HTMLElement | null)?.getAttribute("data-resource-id") || "").catch(() => "");
          if (!resourceId) {
            const url = page.url?.() || "";
            try { resourceId = resourceIdFromArticleUrl(url); } catch { resourceId = ""; }
          }
          if (!resourceId) await sleep(1000);
        }
      }
      if (!resourceId) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Royal Society resourceId was not found for export", { doi });
      const source_url = buildRoyalSocCitationDownloadUrl(resourceId, format);
      const body = await fetchRoyalSocCitationViaManagedPage(page, source_url, downloadDir);
      const artifact_path = uniquePath(downloadDir, `royalsoc-${safeFileToken(doi || resourceId)}.${FORMAT_TO_EXTENSION[format]}`);
      fs.writeFileSync(artifact_path, body);
      const text = fs.readFileSync(artifact_path, "utf-8");
      if (format === "ris" && (!/^TY  - /m.test(text) || !/^ER  -/m.test(text) || (doi && !text.includes(doi)))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Royal Society RIS artifact failed content validation", { artifact_path, doi, resourceId });
      }
      if (format === "bibtex" && (!/^@article\{/im.test(text) || (doi && !text.includes(doi)))) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Royal Society BibTeX artifact failed content validation", { artifact_path, doi, resourceId });
      }
      if ((format === "endnote" || format === "refworks") && doi && !text.includes(doi)) {
        throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Royal Society citation artifact failed DOI validation", { artifact_path, doi, format });
      }
      return { artifact_path, bytes: fs.statSync(artifact_path).size, sha256: sha256File(artifact_path), format, doi, resource_id: resourceId, source_url };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
      throw new WebAiToolError(code, "Royal Society export failed", { doi, format, cause: error?.message || String(error) });
    }
  });
}
