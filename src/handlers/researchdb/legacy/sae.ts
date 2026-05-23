const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "../../../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { freeSession } from "../../../browser/sessionPool";
import { activeManagedPage, firstBrowserContext, requireCdpPageId } from "../../../browser/managedPageRouting";
import { TabRegistry } from "../../../browser/tabRegistry";
import { getStoragePaths } from "../../../utils/paths";
import { artifactClickOnPage, waitForArtifactPageReady } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export type SaeFacet = "Technical Paper" | "Aerospace" | "Automotive" | "Journal Article" | "Magazine Article" | "Standard" | string;
export type SaeExportFormat = "ris" | "bibtex" | "endnote" | "metadata";

export interface SaeItem { title: string; authors: string[]; publication: string; year: number | null; doi: string; }
export interface SaeSearchArgs { query: string; page_size?: number; profile?: string; cdp_port?: number; tab_id?: string; }
export interface SaeFilterArgs extends SaeSearchArgs { facet?: SaeFacet; }
export interface SaeExportArgs extends SaeFilterArgs { format?: SaeExportFormat; download_dir?: string; }

export class WebAiToolError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

const SAE_ORIGIN = "https://saemobilus.sae.org";
const SAE_SEARCH_INPUT = "input[matinput][type=search], input[type=search]";
const VALID_FORMATS = new Set(["ris", "bibtex", "endnote", "metadata"]);
const FORMAT_MENU: Record<SaeExportFormat, string> = { ris: "RefMan", bibtex: "BibTex", endnote: "EndNote", metadata: "Export Metadata" };
const FORMAT_PATTERN: Record<SaeExportFormat, string | undefined> = { ris: "*.ris", bibtex: "*.bib", endnote: undefined, metadata: undefined };

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function asPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `${name} must be a positive integer`, { [name]: value });
  return n;
}
function requireQuery(query: string): string {
  if (!query || !query.trim()) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "query is required");
  return query.trim();
}
function requireFacet(facet?: string): string {
  const out = (facet || "Technical Paper").trim();
  if (!out) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "facet must be non-empty", { facet });
  return out;
}
function normalizeFormat(format?: string): SaeExportFormat {
  const out = (format || "bibtex").toLowerCase();
  if (!VALID_FORMATS.has(out)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported SAE Mobilus export format: ${format}`, { format, valid: [...VALID_FORMATS] });
  return out as SaeExportFormat;
}
function doubleEncode(value: string): string { return encodeURIComponent(encodeURIComponent(value)); }

export function buildSaeSearchUrl(args: SaeSearchArgs): string {
  const query = requireQuery(args.query);
  asPositiveInt(args.page_size, "page_size");
  return `${SAE_ORIGIN}/search#q=${doubleEncode(query)}`;
}

export function buildSaeFilterUrl(args: SaeFilterArgs): string {
  return `${buildSaeSearchUrl(args)}&sub_group=${doubleEncode(requireFacet(args.facet))}`;
}

export function parseSaeResultCount(text: string): number {
  const body = text || "";
  const raw =
    /Items\s*\(([\d,]+)\)/i.exec(body)?.[1] ||
    /Items\s*:\s*([\d,]+)\s+results\b/i.exec(body)?.[1] ||
    /\b([\d,]+)\s+results\b/i.exec(body)?.[1];
  if (!raw) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SAE Mobilus result count node was not found", { probe: "Items (N) or Items: N results" });
  return Number(raw.replace(/,/g, ""));
}

function cleanText(value: string): string { return (value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function yearFromText(text: string): number | null { const match = /\b(19\d{2}|20\d{2})\b/.exec(text); return match ? Number(match[1]) : null; }
function doiFromText(text: string): string { return (/10\.4271\/[A-Za-z0-9._/-]+/i.exec(text)?.[0] || "").replace(/[),.;]+$/, ""); }
function authorsFromText(text: string): string[] {
  const beforePublication = text.split(/\b(?:SAE|International|WCX|AeroTech|Journal|Technical Paper|Published)\b/i)[0] || "";
  return beforePublication.split(/,| and /).map((s) => s.trim()).filter((s) => s && !/^(Document Locked|Access Granted|Abstract|PDF|Citation|Export|Technical Paper)$/i.test(s)).slice(0, 12);
}

export function parseSaeItemsFromHtml(html: string): SaeItem[] {
  const body = String(html || "");
  const cards = [...body.matchAll(/<mobi-publication-document-card\b[^>]*>([\s\S]*?)<\/mobi-publication-document-card>/gi)].map((m) => m[1]);
  const currentDomItems = cards.map((block) => {
    const title = cleanText(/<mat-card-title\b[^>]*>([\s\S]*?)<\/mat-card-title>/i.exec(block)?.[1] || "").replace(/^(?:lock|verified_user)\s+/i, "");
    const authorsHtml = /<mat-card-content\b[^>]*si-card__c--authors[^>]*>([\s\S]*?)<\/mat-card-content>/i.exec(block)?.[1] || "";
    const authors = [...authorsHtml.matchAll(/<span\b[^>]*>([^<]+)<\/span>/gi)]
      .map((m) => cleanText(m[1]))
      .filter((name) => name && name !== "," && !/^,&?$/.test(name))
      .slice(0, 12);
    const text = cleanText(block);
    const publication = cleanText(/data-tabtext=["']([^"']+)["']/i.exec(block)?.[1] || /aria-label=["']Browse\s+([^"']+?)\s+Content["']/i.exec(block)?.[1] || "");
    return { title, authors, publication, year: yearFromText(text), doi: doiFromText(text) };
  }).filter((item) => item.title && !/^Results$/i.test(item.title)).slice(0, 100);
  if (currentDomItems.length) return currentDomItems;

  const blocks = [...body.matchAll(/<[^>]+class=["'][^"']*(?:result|search|item|card)[^"']*["'][^>]*>([\s\S]*?)(?=<[^>]+class=["'][^"']*(?:result|search|item|card)[^"']*["']|$)/gi)].map((m) => m[1]);
  return blocks.map((block) => {
    const title = cleanText(/<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] || /<h\d[^>]*>([\s\S]*?)<\/h\d>/i.exec(block)?.[1] || "");
    const text = cleanText(block).replace(title, "");
    const doi = doiFromText(text);
    const year = yearFromText(text);
    const publication = (text.match(/(?:SAE [A-Za-z0-9 &-]+|WCX SAE [A-Za-z0-9 &-]+|[A-Za-z0-9 &-]+ Symposium|[A-Za-z0-9 &-]+ Conference)/)?.[0] || "").trim();
    return { title, authors: authorsFromText(text), publication, year, doi };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

export function parseSaeItemsFromVisibleText(text: string): SaeItem[] {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const tail = normalized.split(/Items\s*\([\d,]+\)/i).pop() || normalized;
  const pieces = tail.split(/\s+(?=(?:Document Locked|Access Granted|Technical Paper|Journal Article|Standard)\s+)/i).slice(1);
  return pieces.map((piece) => {
    const doi = doiFromText(piece);
    const year = yearFromText(piece);
    const stripped = piece.replace(/^(?:Document Locked|Access Granted|Technical Paper|Journal Article|Standard)\s+/i, "");
    const title = stripped.split(/\s+(?:Kokate,|Qin,|Yugulis,|Published|SAE|WCX|https:\/\/doi\.org\/|10\.4271\/)/i)[0].trim();
    const publication = (piece.match(/(?:SAE [A-Za-z0-9 &-]+|WCX SAE [A-Za-z0-9 &-]+|[A-Za-z0-9 &-]+ Symposium|[A-Za-z0-9 &-]+ Conference)/)?.[0] || "").trim();
    const authorPart = stripped.slice(title.length).split(/Published|SAE|WCX|https:\/\/doi\.org\/|10\.4271\//i)[0] || "";
    return { title, authors: authorsFromText(authorPart), publication, year, doi };
  }).filter((item) => item.title || item.doi).slice(0, 100);
}

async function allocateSaeHomeSession(profile: string, tabId: string, cdpPort?: number): Promise<void> {
  const registry = new TabRegistry(getStoragePaths().dataDir);
  const existing = await registry.get(tabId);
  if (existing?.status === "active") throw new Error(`Tab ID "${tabId}" is already allocated`);
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, cdpPort });
  const browser = await launcher.connectOverCdp(status);
  try {
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    await page.goto(`${SAE_ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    await registry.register({ tabId, pageId, url: page.url?.() || `${SAE_ORIGIN}/`, profile, allocatedAt: new Date().toISOString(), status: "active" });
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

async function withAllocatedSaePage<T>(profile: string, tabId: string, cdpPort: number | undefined, fn: (page: any, browser: any) => Promise<T>, keepTab = false): Promise<T> {
  await freeSession(tabId).catch(() => undefined);
  try {
    await allocateSaeHomeSession(profile, tabId, cdpPort);
  } catch (error) {
    throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "SAE Mobilus homepage tab allocation/navigation failed", { cause: error instanceof Error ? error.message : String(error) });
  }
  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile, cdpPort });
  const browser = await launcher.connectOverCdp(status);
  try {
    const page = await activeManagedPage(browser, undefined, tabId);
    return await fn(page, browser);
  } finally {
    await browser.close?.().catch(() => undefined);
    if (!keepTab) await freeSession(tabId).catch(() => undefined);
  }
}

async function dismissOneTrust(page: any): Promise<void> {
  await page.locator("#onetrust-accept-btn-handler").click({ timeout: 2500 }).catch(() => undefined);
}

function normalizeSaeQuery(value: string): string { return String(value || "").replace(/\s+/g, " ").trim().toLowerCase(); }
function tryParseSaeResultCount(text: string): number | undefined {
  try { return parseSaeResultCount(text); } catch { return undefined; }
}

async function saeQuerySettled(page: any, query?: string): Promise<boolean> {
  if (!query) return true;
  const expected = normalizeSaeQuery(query);
  const inputValue = normalizeSaeQuery(await page.locator(SAE_SEARCH_INPUT).first().inputValue({ timeout: 1000 }).catch(() => ""));
  if (inputValue === expected) return true;
  const title = normalizeSaeQuery(await page.title().catch(() => ""));
  return title.includes(expected);
}

async function ensureSaeSearchRoute(page: any, query?: string): Promise<void> {
  await dismissOneTrust(page);
  if (query) {
    await page.goto(buildSaeSearchUrl({ query }), { waitUntil: "domcontentloaded", timeout: 45000 });
  } else if (!/\/search(?:$|[#?])/.test(page.url?.() || "")) {
    const searchNav = page.locator("#searchNavBtn");
    if (await searchNav.count().catch(() => 0)) await searchNav.click({ timeout: 15000 });
    else await page.goto(`${SAE_ORIGIN}/search`, { waitUntil: "domcontentloaded", timeout: 45000 });
  }
  for (let i = 0; i < 30; i++) {
    await dismissOneTrust(page);
    const url = page.url?.() || "";
    const searchInputs = await page.locator(SAE_SEARCH_INPUT).count().catch(() => 0);
    const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (/\/search(?:$|[#?])/.test(url) && searchInputs > 0 && tryParseSaeResultCount(text) !== undefined && await saeQuerySettled(page, query)) return;
    await sleep(1000);
  }
  throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SAE Mobilus SPA search route did not hydrate", { url: page.url?.() || "", query });
}

async function runSaeQuery(page: any, query: string): Promise<void> {
  await ensureSaeSearchRoute(page, requireQuery(query));
}

async function readSaeResults(page: any, expectedUrl?: RegExp, previousCount?: number, expectedQuery?: string): Promise<{ visibleText: string; title: string; html: string; url: string; resultCount: number; items: SaeItem[] }> {
  let stable: any;
  let lastError: unknown;
  for (let i = 0; i < 30; i++) {
    try {
      const visibleText = await page.locator("body").innerText({ timeout: 10000 });
      const resultCount = parseSaeResultCount(visibleText);
      const url = page.url?.() || "";
      if ((!expectedUrl || expectedUrl.test(url)) && (previousCount === undefined || resultCount !== previousCount) && await saeQuerySettled(page, expectedQuery)) {
        const title = await page.title().catch(() => "");
        const html = await page.content().catch(() => "");
        const items = parseSaeItemsFromHtml(html);
        stable = { visibleText, title, html, url, resultCount, items: items.length ? items : parseSaeItemsFromVisibleText(visibleText) };
        break;
      }
    } catch (error) { lastError = error; }
    await sleep(2000);
  }
  if (!stable) {
    if (lastError instanceof WebAiToolError) throw lastError;
    throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SAE Mobilus results page did not hydrate", { url: page.url?.() || "", cause: lastError instanceof Error ? lastError.message : String(lastError) });
  }
  return stable;
}

async function applySaeFacet(page: any, facet: string, previousCount: number): Promise<void> {
  const inputSelector = `input.mat-checkbox-input[value=${JSON.stringify(facet)}]`;
  const input = page.locator(inputSelector).first();
  let inputId = "";
  let sawInput = false;
  for (let i = 0; i < 30; i++) {
    await dismissOneTrust(page);
    const inputCount = await input.count().catch(() => 0);
    if (inputCount) {
      sawInput = true;
      inputId = await input.getAttribute("id").catch(() => "") || "";
      if (inputId) break;
    }
    await sleep(1000);
  }
  if (!sawInput) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SAE Mobilus facet checkbox was not found", { facet, selector: inputSelector });
  if (!inputId) throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SAE Mobilus facet checkbox id was not found", { facet, selector: inputSelector });
  const labelSelector = `label[for=${JSON.stringify(inputId)}]`;
  await input.scrollIntoViewIfNeeded();
  await page.locator(labelSelector).first().click({ timeout: 10000 });
  await readSaeResults(page, new RegExp(`[&#]sub_group=${doubleEncode(facet).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), previousCount);
}

export async function researchSaeSearch(args: SaeSearchArgs): Promise<{ result_count: number; items: SaeItem[]; query_url: string }> {
  const query_url = buildSaeSearchUrl(args);
  const profile = args.profile || "research-sae";
  const tabId = args.tab_id || `research-sae-search-${Date.now()}`;
  const page = await withAllocatedSaePage(profile, tabId, args.cdp_port, async (p) => {
    await runSaeQuery(p, args.query);
    return readSaeResults(p, /#q=/, undefined, args.query);
  });
  return { result_count: page.resultCount, items: page.items, query_url };
}

export async function researchSaeFilter(args: SaeFilterArgs): Promise<{ result_count: number; items: SaeItem[]; refined_url: string; confirm_title: string }> {
  const refined_url = buildSaeFilterUrl(args);
  const profile = args.profile || "research-sae";
  const tabId = args.tab_id || `research-sae-filter-${Date.now()}`;
  const page = await withAllocatedSaePage(profile, tabId, args.cdp_port, async (p) => {
    await runSaeQuery(p, args.query);
    const base = await readSaeResults(p, /#q=/, undefined, args.query);
    await applySaeFacet(p, requireFacet(args.facet), base.resultCount);
    return readSaeResults(p, /sub_group=/);
  });
  return { result_count: page.resultCount, items: page.items, refined_url, confirm_title: page.title };
}

function validateSaeArtifact(artifactPath: string, format: SaeExportFormat): void {
  const text = fs.readFileSync(artifactPath, "utf-8");
  if (format === "bibtex" && (!/^@[A-Za-z]+\{/m.test(text) || !/\btitle\s*=/i.test(text) || !/\byear\s*=/i.test(text))) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SAE Mobilus BibTeX artifact failed content validation", { artifact_path: artifactPath });
  }
  if (format === "ris" && (!/^TY\s+-\s+/m.test(text) || !/^ER\s+-/m.test(text))) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SAE Mobilus RIS artifact failed content validation", { artifact_path: artifactPath });
  }
  if (format === "endnote" && !/%0\s+/m.test(text)) {
    throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "SAE Mobilus EndNote artifact failed content validation", { artifact_path: artifactPath });
  }
}

export async function researchSaeExport(args: SaeExportArgs): Promise<{ artifact_path: string; bytes: number; sha256: string; format: SaeExportFormat; query: string; result_count: number }> {
  const format = normalizeFormat(args.format);
  const profile = args.profile || "research-sae";
  const downloadDir = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads", "sae"));
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must resolve to an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
  const tabId = args.tab_id || `research-sae-export-${Date.now()}`;
  return await withAllocatedSaePage(profile, tabId, args.cdp_port, async (page, browser) => {
    try {
      await runSaeQuery(page, args.query);
      let results = await readSaeResults(page, /#q=/, undefined, args.query);
      if (args.facet) {
        await applySaeFacet(page, requireFacet(args.facet), results.resultCount);
        results = await readSaeResults(page, /sub_group=/);
      }
      await page.locator('button[aria-label="Select Row"]').first().click({ timeout: 15000 });
      for (let i = 0; i < 10; i++) {
        const text = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
        if (/Selected:\s*\d+\//i.test(text) && /Export/i.test(text)) break;
        await sleep(1000);
      }
      const artifactOptions = {
        profile,
        buttonSelector: 'button[aria-label="Export"]',
        followUpTextRegex: FORMAT_MENU[format],
        downloadDir,
        timeoutMs: 90000,
        locateTimeoutMs: 30000,
        frameMinCount: 0,
        filenamePattern: FORMAT_PATTERN[format],
        verifyMinBytes: 100
      };
      const pageReadyEvidence = await waitForArtifactPageReady(page, artifactOptions);
      const clicked = await artifactClickOnPage(browser, page, { ...artifactOptions, pageReadyEvidence, maxViewportY: 1000 });
      validateSaeArtifact(clicked.path, format);
      return { artifact_path: clicked.path, bytes: fs.statSync(clicked.path).size, sha256: sha256File(clicked.path), format, query: requireQuery(args.query), result_count: results.resultCount };
    } catch (error: any) {
      if (error instanceof WebAiToolError) throw error;
      const raw = String(error?.errorCode || error?.message || error);
      const code = raw.includes("ARTIFACT_DOWNLOAD_TIMEOUT") || /timeout/i.test(raw)
        ? ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT
        : raw.includes("ARTIFACT_VERIFICATION_FAILED") ? ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED
        : raw.includes("ELEMENT_NOT_FOUND") ? ConsumerErrorCodes.ELEMENT_NOT_FOUND
        : raw.includes("INVALID_ARGS") ? ConsumerErrorCodes.INVALID_ARGS
        : ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED;
      throw new WebAiToolError(code, "SAE Mobilus export failed", { query: args.query, format, cause: error?.message || String(error) });
    }
  });
}
