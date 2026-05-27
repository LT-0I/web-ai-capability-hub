const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { safeProfileName } from "../../../browser/profileStore";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { firstBrowserContext } from "../../../browser/managedPageRouting";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota, recordLiteratureDownload } from "../../../runtime/literature/quota";
import { ensureDir, safeFilename } from "../../../utils/paths";
import {
  defaultLiteratureOutputDir,
  LiteratureDownloadError,
  LiteratureDownloadPdfOutput,
  LiteratureDownloadedPdf,
  literatureErrorOutput
} from "./arxiv";
import { resolveUnpaywallOaPdf } from "./unpaywall";

type PaywalledOaSource = "publisher" | "unpaywall" | "none";
type PaywalledLiteratureDownloadPdfOutput = LiteratureDownloadPdfOutput & { oa_source: PaywalledOaSource };

export interface PaywalledLiteratureDownloadPdfArgs {
  doc_id: string;
  pdf_url?: string;
  profile?: string;
  output_dir?: string;
  cdp_port?: number;
  unpaywall_email?: string;
}

export interface PaywalledLiteratureConfig {
  db_slug: string;
  display_name: string;
  default_profile: string;
  selectors: string[];
  metadata_tool: string | null;
  article_url_resolver?: (docId: string, pdfUrl: string) => string | string[] | null;
  prefer_article_first?: boolean;
  candidate_url_filter?: (url: string, docId: string, contextUrl: string) => boolean;
  unpaywall_fallback?: boolean;
}

interface DownloadEventState {
  guid?: string;
  suggestedFilename?: string;
  url?: string;
  state?: string;
  will?: boolean;
}

interface CompletedDownload {
  filePath: string;
  suggestedFilename?: string;
  url?: string;
}

function emptyOutput(overrides: Partial<PaywalledLiteratureDownloadPdfOutput>): PaywalledLiteratureDownloadPdfOutput {
  return {
    ok: false,
    task_id: null,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: null,
    message: null,
    oa_source: "none",
    ...overrides
  };
}

function now(): number { return Date.now(); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function requireDocId(doc_id: unknown): string {
  const value = String(doc_id || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function asOptionalUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function requestedPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>, docId: string): string | null {
  return asOptionalUrl(args?.pdf_url) || asOptionalUrl(docId);
}

function unresolvedPdfUrlError(config: PaywalledLiteratureConfig, docId: string): LiteratureDownloadError {
  const metadataName = config.metadata_tool || `research_${config.db_slug}_get_metadata`;
  return new LiteratureDownloadError(
    ConsumerErrorCodes.ELEMENT_NOT_FOUND,
    `${config.display_name} PDF URL was not resolved for doc_id "${docId}"; ${metadataName} is not present in this build, so pass pdf_url (or use a URL as doc_id) to use the authenticated browser-session driver`,
    { db_slug: config.db_slug, doc_id: docId, metadata_tool: metadataName, fallback: "pdf_url" }
  );
}

function safePdfBasename(docId: string): string {
  const doiSlashSanitized = String(docId || "").replace(/[\\/]+/g, "_");
  return `${safeFilename(doiSlashSanitized).replace(/\.pdf$/i, "")}.pdf`;
}

function targetPdfPath(outputDir: string, docId: string): string {
  return path.resolve(outputDir, safePdfBasename(docId));
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isPdfBuffer(buffer: Buffer | null | undefined): boolean {
  return !!buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString() === "%PDF-";
}

function htmlDecode(value: string): string {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function looksLikeHtml(buffer: Buffer, contentType = ""): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  return /^\s*<(?:!doctype\s+html|html|head|body|script|meta)\b/i.test(buffer.subarray(0, 512).toString());
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  const raw = htmlDecode(String(href || "").trim());
  if (!raw || /^javascript:|^mailto:|^#/i.test(raw)) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function pdfLikeHrefScore(href: string, text = ""): number {
  const hay = `${href} ${text}`;
  let score = 0;
  if (/\.pdf(?:$|[?#])/i.test(href)) score += 12;
  if (/(?:\/pdf|pdf\/|pdfft|stamp\.jsp|viewmedia\.cfm|fulltextpdf|full\/pdf)/i.test(href)) score += 10;
  if (/\bpdf\b|download|full.?text|click here|全文|下载|查看/i.test(text)) score += 6;
  if (/citation|ris|bibtex|references?|supplement|figure|image|logo|privacy|terms/i.test(hay)) score -= 20;
  return score;
}

function pdfCandidateUrlsFromHtml(html: string, baseUrl: string): string[] {
  const candidates: Array<{ url: string; score: number }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] || "";
    const text = htmlDecode((match[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const href = /(?:href|data-pdf-url|data-url)=["']([^"']+)["']/i.exec(attrs)?.[1];
    const aria = /(?:aria-label|title)=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    const url = href ? absoluteUrl(href, baseUrl) : null;
    if (!url) continue;
    const score = pdfLikeHrefScore(url, `${text} ${aria}`);
    if (score > 0) candidates.push({ url, score });
  }

  for (const pattern of [
    /(?:src|href)=["']([^"']*(?:\.pdf|\/pdf|pdfft|stamp\.jsp|viewmedia\.cfm|fulltextPDF)[^"']*)["']/gi,
    /["'](?:pdfUrl|pdf_url|downloadUrl|download_url|url)["']\s*:\s*["']([^"']*(?:\.pdf|\/pdf|pdfft|stamp\.jsp|viewmedia\.cfm|fulltextPDF)[^"']*)["']/gi,
    /<meta\b[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)[^"']*["']/gi
  ]) {
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = pattern.exec(html))) {
      const url = absoluteUrl(urlMatch[1], baseUrl);
      if (!url) continue;
      const score = pdfLikeHrefScore(url);
      if (score > 0) candidates.push({ url, score });
    }
  }

  return uniqueUrls(candidates.sort((a, b) => b.score - a.score).map((entry) => entry.url));
}

function candidateUrlAllowed(config: PaywalledLiteratureConfig | undefined, url: string, docId: string, contextUrl: string): boolean {
  if (!config?.candidate_url_filter) return true;
  try {
    return config.candidate_url_filter(url, docId, contextUrl) !== false;
  } catch {
    return true;
  }
}

function writeBufferDownload(downloadDir: string, docId: string, buffer: Buffer, sourceUrl: string): CompletedDownload {
  ensureDir(downloadDir);
  const filePath = path.resolve(downloadDir, `fetched-${Date.now()}-${safePdfBasename(docId)}`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, url: sourceUrl };
}

function directoryHasExistingState(dir: string | undefined): boolean {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name: string) => name !== "DevToolsActivePort" && !name.startsWith("Singleton"));
  } catch {
    return false;
  }
}

function hasRegisteredOrExistingProfileState(launcher: any, profile: string): boolean {
  const record = launcher?.profileStore?.list?.().find((entry: any) => entry?.profileName === profile);
  if (directoryHasExistingState(record?.profileDir)) return true;
  const root = launcher?.profileStore?.profilesRoot;
  return directoryHasExistingState(root ? path.join(root, safeProfileName(profile)) : undefined);
}

async function connectResearchBrowser(launcher: any, profile: string, cdpPort?: number): Promise<any> {
  const hasProfileState = hasRegisteredOrExistingProfileState(launcher, profile);
  if (cdpPort && !hasProfileState) {
    const host = process.env.WAH_CDP_HOST || "127.0.0.1";
    return launcher.connectOverCdp({
      profile,
      profileDir: "",
      cdpEndpoint: `http://${host}:${cdpPort}`,
      cdpPort,
      connected: true,
      launchedByPackage: false
    });
  }
  if (!hasProfileState) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.PROFILE_NOT_FOUND,
      `Authenticated research browser profile "${profile}" is not registered or initialized; refusing to spawn a fresh logged-out Chrome for paywalled literature download`,
      { profile }
    );
  }
  const status = await launcher.launch({ profile, cdpPort });
  return launcher.connectOverCdp(status);
}

function listStableFiles(dir: string): Set<string> {
  ensureDir(dir);
  return new Set(fs.readdirSync(dir).map((name: string) => path.resolve(dir, name)));
}

function isDownloadTempFile(filePath: string): boolean {
  return /\.(?:crdownload|tmp|download)$/i.test(filePath) || path.basename(filePath).startsWith(".");
}

function newestCompletedFile(downloadDir: string, before: Set<string>): string | null {
  const entries = fs.readdirSync(downloadDir)
    .map((name: string) => path.resolve(downloadDir, name))
    .filter((filePath: string) => !before.has(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile() && !isDownloadTempFile(filePath))
    .map((filePath: string) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs, size: fs.statSync(filePath).size }))
    .filter((entry: { size: number }) => entry.size > 0)
    .sort((a: { mtimeMs: number }, b: { mtimeMs: number }) => b.mtimeMs - a.mtimeMs);
  return entries[0]?.filePath || null;
}

async function armDownloadBehavior(browser: any, page: any, downloadDir: string): Promise<{ bcdp: any; pageCdp: any; events: Map<string, DownloadEventState> }> {
  if (!browser?.newBrowserCDPSession) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "Browser-level CDP session is required for Browser.setDownloadBehavior");
  const bcdp = await browser.newBrowserCDPSession();
  const pageCdp = await page.context?.()?.newCDPSession?.(page);
  if (!bcdp?.send || !pageCdp?.send) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "Browser.setDownloadBehavior requires browser and page CDP sessions");
  ensureDir(downloadDir);
  const events = new Map<string, DownloadEventState>();
  bcdp.on?.("Browser.downloadWillBegin", (event: any) => events.set(String(event.guid), { ...(events.get(String(event.guid)) || {}), ...event, will: true }));
  bcdp.on?.("Browser.downloadProgress", (event: any) => events.set(String(event.guid), { ...(events.get(String(event.guid)) || {}), ...event }));
  await bcdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true });
  await pageCdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true }).catch(() => undefined);
  return { bcdp, pageCdp, events };
}

function eventCompletedDownload(downloadDir: string, events: Map<string, DownloadEventState>): CompletedDownload | null {
  for (const [guid, event] of events.entries()) {
    if (event.state !== "completed") continue;
    const filePath = path.resolve(downloadDir, guid);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
      return { filePath, suggestedFilename: event.suggestedFilename, url: event.url };
    }
  }
  return null;
}

async function waitForDownload(downloadDir: string, before: Set<string>, events: Map<string, DownloadEventState>, timeoutMs: number): Promise<CompletedDownload | null> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const completed = eventCompletedDownload(downloadDir, events);
    if (completed) return completed;
    const filePath = newestCompletedFile(downloadDir, before);
    if (filePath) return { filePath };
    await sleep(100);
  }
  return null;
}

async function findClickableHandle(page: any, selectors: string[]): Promise<{ selector: string; handle: any; box: { x: number; y: number; width: number; height: number } } | null> {
  for (const selector of selectors) {
    try {
      const locator = page.locator?.(selector).first?.() || page.locator?.(selector);
      const count = typeof page.locator?.(selector).count === "function" ? await page.locator(selector).count().catch(() => 0) : 0;
      if (!locator || count === 0) continue;
      await locator.scrollIntoViewIfNeeded?.({ timeout: 3000 }).catch(() => undefined);
      const handle = await locator.elementHandle?.({ timeout: 3000 }).catch(() => null);
      if (!handle) continue;
      const box = await handle.boundingBox?.();
      if (!box || box.width <= 0 || box.height <= 0) continue;
      return { selector, handle, box };
    } catch {
      // Try the next selector; selector drift must not trigger a new error code.
    }
  }
  return null;
}

async function dispatchCdpClick(pageCdp: any, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await pageCdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await pageCdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await pageCdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function humanizeBeforePdfClick(page: any): Promise<void> {
  await page.waitForTimeout(jitter(400, 900));
  await page.mouse.move(jitter(100, 400), jitter(100, 400), { steps: 6 });
  await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300)));
}

async function navigateForDownload(page: any, url: string): Promise<any | null> {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    return response || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Chromium reports net::ERR_ABORTED for successful attachment downloads.
    if (!/ERR_ABORTED|Download is starting/i.test(message)) throw error;
    return null;
  }
}

async function navigateForInspectablePage(page: any, url: string): Promise<any | null> {
  try {
    return await navigateForDownload(page, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // PDF viewer pages and Cloudflare/Silverchair challenge redirects sometimes
    // keep the document in a loading state even after useful DOM/network state is
    // available. Keep the page inspectable; final verification still requires
    // a real %PDF artifact.
    if (/Timeout .*navigating|Navigation timeout|Timeout \d+ms exceeded/i.test(message)) return null;
    throw error;
  }
}

function responseHeader(response: any, name: string): string {
  try {
    return String(response?.headers?.()?.[name.toLowerCase()] || "");
  } catch {
    return "";
  }
}

async function inlinePdfCompletedDownload(page: any, response: any, downloadDir: string, docId: string, resolvedUrl: string): Promise<CompletedDownload | null> {
  const responseUrl = String(response?.url?.() || resolvedUrl);
  const contentType = responseHeader(response, "content-type");
  if (!/application\/pdf/i.test(contentType) && !/\.pdf(?:$|[?#])/i.test(responseUrl)) return null;
  let buffer: Buffer | null = null;
  try {
    const body = await response?.body?.();
    if (body) buffer = Buffer.from(body);
  } catch {
    // Fall through to the browser-context request path; it carries the active profile cookies.
  }
  if (!buffer || buffer.subarray(0, 5).toString() !== "%PDF-") {
    const request = page.context?.()?.request;
    const apiResponse = request?.get ? await request.get(responseUrl, { timeout: 60000 } as any) : null;
    if (apiResponse?.ok?.()) buffer = Buffer.from(await apiResponse.body());
  }
  if (!isPdfBuffer(buffer)) return null;
  return writeBufferDownload(downloadDir, docId, buffer as Buffer, responseUrl);
}

async function fetchPdfCandidate(page: any, downloadDir: string, docId: string, url: string, config?: PaywalledLiteratureConfig, seen = new Set<string>()): Promise<CompletedDownload | null> {
  const candidateUrl = asOptionalUrl(url);
  if (!candidateUrl || seen.has(candidateUrl) || seen.size > 8) return null;
  seen.add(candidateUrl);
  const request = page.context?.()?.request;
  if (!request?.get) return null;
  let response: any;
  try {
    response = await request.get(candidateUrl, {
      timeout: 60000,
      headers: {
        "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8"
      }
    } as any);
  } catch {
    return null;
  }
  if (!response?.ok?.()) return null;
  const responseUrl = String(response.url?.() || candidateUrl);
  const headers = response.headers?.() || {};
  const contentType = String(headers["content-type"] || headers["Content-Type"] || "");
  const buffer = Buffer.from(await response.body());
  if (isPdfBuffer(buffer)) return writeBufferDownload(downloadDir, docId, buffer, responseUrl);
  if (!looksLikeHtml(buffer, contentType)) return null;
  const html = buffer.toString("utf8");
  for (const nextUrl of pdfCandidateUrlsFromHtml(html, responseUrl)) {
    if (!candidateUrlAllowed(config, nextUrl, docId, responseUrl)) continue;
    const downloaded = await fetchPdfCandidate(page, downloadDir, docId, nextUrl, config, seen);
    if (downloaded) return downloaded;
  }
  return null;
}

async function pagePdfCandidateUrls(page: any): Promise<string[]> {
  const pageUrl = String(page?.url?.() || "");
  const urls = await page.evaluate?.(() => {
    function text(el: Element): string {
      return ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    }
    return Array.from(document.querySelectorAll("a,iframe,embed,object,[data-pdf-url],[data-url]")).map((el) => {
      const attrs = ["href", "src", "data-pdf-url", "data-url", "aria-label", "title", "download"]
        .map((name) => [name, el.getAttribute(name)] as const)
        .filter((entry) => !!entry[1]);
      return { text: text(el), attrs };
    });
  }).catch(() => []);
  const candidates: Array<{ url: string; score: number }> = [];
  for (const entry of urls || []) {
    const attrs = new Map<string, string>(entry.attrs || []);
    const raw = attrs.get("href") || attrs.get("src") || attrs.get("data-pdf-url") || attrs.get("data-url") || "";
    const url = absoluteUrl(raw, pageUrl);
    if (!url) continue;
    const score = pdfLikeHrefScore(url, `${entry.text || ""} ${attrs.get("aria-label") || ""} ${attrs.get("title") || ""} ${attrs.get("download") || ""}`);
    if (score > 0) candidates.push({ url, score });
  }
  return uniqueUrls(candidates.sort((a, b) => b.score - a.score).map((entry) => entry.url));
}

function articleUrlCandidates(config: PaywalledLiteratureConfig, docId: string, resolvedUrl: string): string[] {
  const configured = config.article_url_resolver?.(docId, resolvedUrl);
  const fromConfig = Array.isArray(configured) ? configured : configured ? [configured] : [];
  const doiUrl = /^10\.\S+\/\S+/.test(docId) ? `https://doi.org/${encodePathForUrlPath(docId)}` : null;
  return uniqueUrls([...fromConfig, doiUrl].map((url) => asOptionalUrl(url)));
}

function encodePathForUrlPath(value: string): string {
  return String(value || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function finalizeDownloadedPdf(downloaded: CompletedDownload, outputDir: string, docId: string, resolvedUrl: string): LiteratureDownloadedPdf {
  const target = targetPdfPath(outputDir, docId);
  ensureDir(path.dirname(target));
  if (fs.existsSync(target) && path.resolve(downloaded.filePath) !== target) fs.rmSync(target, { force: true });
  const downloadedPath = path.resolve(downloaded.filePath);
  const size = fs.statSync(downloadedPath).size;
  if (size <= 0) throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Paywalled literature PDF download was empty", { path: downloadedPath, resolved_url: resolvedUrl });
  const header = fs.readFileSync(downloadedPath, { encoding: null, flag: "r" }).subarray(0, 5).toString("utf8");
  if (header !== "%PDF-") throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Paywalled literature download did not produce a PDF artifact", { path: downloadedPath, resolved_url: resolvedUrl });
  if (downloadedPath !== target) fs.renameSync(downloadedPath, target);
  return { path: target, sha256: sha256File(target), size, downloaded_at: now(), resolved_url: resolvedUrl };
}

function tryFinalizeDownloadedPdf(downloaded: CompletedDownload | null, outputDir: string, docId: string, resolvedUrl: string, ignoredFiles: Set<string>): LiteratureDownloadedPdf | null {
  if (!downloaded) return null;
  try {
    return finalizeDownloadedPdf(downloaded, outputDir, docId, resolvedUrl);
  } catch (error) {
    if (error instanceof LiteratureDownloadError && error.errorCode === ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED) {
      ignoredFiles.add(path.resolve(downloaded.filePath));
      return null;
    }
    throw error;
  }
}

function doiFromValue(value: unknown): string | null {
  const raw = String(value || "").trim().replace(/^doi:\s*/i, "");
  if (!raw) return null;
  const direct = /^10\.\S+\/\S+$/i.test(raw) ? raw : null;
  if (direct) return direct.replace(/[),.;]+$/g, "");
  let haystack = raw;
  try {
    const parsed = new URL(raw);
    if (/^(?:dx\.)?doi\.org$/i.test(parsed.hostname)) {
      const doiPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      if (/^10\.\S+\/\S+$/i.test(doiPath)) return doiPath.replace(/[),.;]+$/g, "");
    }
    haystack = decodeURIComponent(`${parsed.pathname}${parsed.search || ""}`);
  } catch {
    // Plain DOI-like strings are handled by the regex below.
  }
  const match = /(?:^|[^\w.])(10\.\d{4,9}\/[^\s"'<>?#]+)/i.exec(haystack);
  return match?.[1]?.replace(/[),.;]+$/g, "") || null;
}

function unpaywallPdfFetchTimeoutMs(): number {
  const parsed = Number(process.env.WEBAI_UNPAYWALL_PDF_FETCH_TIMEOUT_MS || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

async function withAbortableTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchPdfBufferFollowingHtml(
  url: string,
  seen = new Set<string>(),
  timeoutMs = unpaywallPdfFetchTimeoutMs()
): Promise<{ buffer: Buffer; resolved_url: string; content_type: string } | null> {
  const candidateUrl = asOptionalUrl(url);
  if (!candidateUrl || seen.has(candidateUrl) || seen.size > 8) return null;
  seen.add(candidateUrl);
  const controller = new AbortController();
  const deadline = now() + timeoutMs;
  let response: Response;
  let buffer: Buffer;
  try {
    response = await withAbortableTimeout(fetch(candidateUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "web-ai-capability-hub-literature-downloader/2.2.0"
      }
    }), timeoutMs, controller);
    if (!response.ok) return null;
    buffer = Buffer.from(await withAbortableTimeout(response.arrayBuffer(), Math.max(1, deadline - now()), controller));
  } catch (error) {
    const message = controller.signal.aborted
      ? `timed out after ${timeoutMs}ms`
      : error instanceof Error ? error.message : String(error);
    throw new LiteratureDownloadError(
      "NETWORK_ERROR",
      `Unpaywall OA PDF fetch failed: ${message}`,
      { url: candidateUrl }
    );
  }
  const contentType = response.headers.get("content-type") || "";
  if (isPdfBuffer(buffer)) return { buffer, resolved_url: response.url || candidateUrl, content_type: contentType };
  if (!looksLikeHtml(buffer, contentType)) return null;
  const html = buffer.toString();
  for (const nextUrl of pdfCandidateUrlsFromHtml(html, response.url || candidateUrl)) {
    const result = await fetchPdfBufferFollowingHtml(nextUrl, seen, timeoutMs);
    if (result && isPdfBuffer(result.buffer)) return result;
  }
  return null;
}

interface UnpaywallFallbackOutcome {
  result: LiteratureDownloadedPdf | null;
  hint: string | null;
  attempted: boolean;
  forceLoginRequired: boolean;
}

function noUnpaywallFallback(hint: string | null = null): UnpaywallFallbackOutcome {
  return { result: null, hint, attempted: false, forceLoginRequired: false };
}

async function tryUnpaywallFallback(
  config: PaywalledLiteratureConfig,
  args: Partial<PaywalledLiteratureDownloadPdfArgs>,
  docId: string,
  requestedUrl: string | null,
  outputDir: string
): Promise<UnpaywallFallbackOutcome> {
  if (!config.unpaywall_fallback) return noUnpaywallFallback();
  const doi = doiFromValue(docId) || doiFromValue(requestedUrl);
  if (!doi) return noUnpaywallFallback("Unpaywall not attempted — no DOI was available for lookup");
  const email = String(args?.unpaywall_email || "").trim();
  if (!email) {
    return {
      result: null,
      hint: "Unpaywall not configured — pass unpaywall_email to check legal OA copies",
      attempted: false,
      forceLoginRequired: !!requestedUrl
    };
  }
  try {
    const resolved = await resolveUnpaywallOaPdf(doi, email);
    if (!resolved.url) {
      return { result: null, hint: `Tried Unpaywall — no OA copy found for DOI ${doi}`, attempted: true, forceLoginRequired: true };
    }
    const fetched = await fetchPdfBufferFollowingHtml(resolved.url);
    if (!fetched || !isPdfBuffer(fetched.buffer)) {
      return { result: null, hint: `Tried Unpaywall — OA URL did not return a verified %PDF artifact for DOI ${doi}`, attempted: true, forceLoginRequired: true };
    }
    const downloaded = writeBufferDownload(outputDir, docId, fetched.buffer, fetched.resolved_url);
    return {
      result: finalizeDownloadedPdf(downloaded, outputDir, docId, fetched.resolved_url),
      hint: null,
      attempted: true,
      forceLoginRequired: false
    };
  } catch (error) {
    const code = (error as { errorCode?: unknown })?.errorCode;
    const message = error instanceof Error ? error.message.replace(new RegExp(`^${String(code)}:\\s*`), "") : String(error);
    const hint = code === "RPC_RATE_LIMITED"
      ? "Tried Unpaywall — rate limited, retry later"
      : code === ConsumerErrorCodes.INVALID_ARGS
        ? `Tried Unpaywall — invalid request (${message})`
        : `Tried Unpaywall — ${message}`;
    return { result: null, hint, attempted: true, forceLoginRequired: true };
  }
}

function appendUnpaywallHint(output: LiteratureDownloadPdfOutput, fallback: UnpaywallFallbackOutcome): LiteratureDownloadPdfOutput {
  if (!fallback.hint) return output;
  const prefix = output.message ? `${output.message} ` : "";
  return { ...output, message: `${prefix}${fallback.hint}.` };
}

function errorOutputWithUnpaywallHint(error: unknown, fallback: UnpaywallFallbackOutcome): PaywalledLiteratureDownloadPdfOutput {
  const output = appendUnpaywallHint(literatureErrorOutput(error), fallback);
  const shouldPreserveCode = output.errorCode === ConsumerErrorCodes.INVALID_ARGS
    || output.errorCode === ConsumerErrorCodes.PROFILE_NOT_FOUND
    || /PDF URL was not resolved|pass pdf_url/i.test(output.message || "");
  if (fallback.forceLoginRequired && !shouldPreserveCode) {
    return { ...output, errorCode: ConsumerErrorCodes.LOGIN_REQUIRED, oa_source: "none" };
  }
  return { ...output, oa_source: "none" };
}

export async function downloadPaywalledLiteraturePdfToDisk(
  config: PaywalledLiteratureConfig,
  doc_id: string,
  pdf_url: string | null,
  output_dir: string,
  profile?: string,
  cdp_port?: number
): Promise<LiteratureDownloadedPdf> {
  const docId = requireDocId(doc_id);
  const resolvedUrl = asOptionalUrl(pdf_url);
  if (!resolvedUrl) throw unresolvedPdfUrlError(config, docId);

  const outputDir = ensureDir(path.resolve(output_dir));
  const selectedProfile = String(profile || config.default_profile || `research-${config.db_slug}`).trim();
  if (!selectedProfile) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "profile is required for paywalled literature PDF downloads");

  const before = listStableFiles(outputDir);
  const launcher = createManagedBrowserLauncher();
  let browser: any;
  let page: any;
  const pagesToClose: any[] = [];
  try {
    browser = await connectResearchBrowser(launcher, selectedProfile, cdp_port);
    const context = await firstBrowserContext(browser);
    page = await context.newPage();
    pagesToClose.push(page);
    const rememberPage = (entry: any) => {
      if (entry && !pagesToClose.includes(entry)) pagesToClose.push(entry);
    };
    const { pageCdp, events } = await armDownloadBehavior(browser, page, outputDir);
    const started = now();

    const tryArticleCandidates = async (): Promise<LiteratureDownloadedPdf | null> => {
      for (const articleUrl of articleUrlCandidates(config, docId, resolvedUrl)) {
        const articleResponse = await navigateForInspectablePage(page, articleUrl);
        const inlineArticlePdf = await inlinePdfCompletedDownload(page, articleResponse, outputDir, docId, articleUrl);
        const finalizedInlineArticlePdf = tryFinalizeDownloadedPdf(inlineArticlePdf, outputDir, docId, inlineArticlePdf?.url || articleUrl, before);
        if (finalizedInlineArticlePdf) return finalizedInlineArticlePdf;
        const currentArticleUrl = asOptionalUrl(page.url?.());
        if (currentArticleUrl) {
          const fetchedCurrentArticle = await fetchPdfCandidate(page, outputDir, docId, currentArticleUrl, config);
          const finalizedCurrentArticle = tryFinalizeDownloadedPdf(fetchedCurrentArticle, outputDir, docId, fetchedCurrentArticle?.url || currentArticleUrl, before);
          if (finalizedCurrentArticle) return finalizedCurrentArticle;
        }
        for (const url of await pagePdfCandidateUrls(page)) {
          if (!candidateUrlAllowed(config, url, docId, page.url?.() || articleUrl)) continue;
          const fetchedArticleCandidate = await fetchPdfCandidate(page, outputDir, docId, url, config);
          const finalizedArticleCandidate = tryFinalizeDownloadedPdf(fetchedArticleCandidate, outputDir, docId, fetchedArticleCandidate?.url || url, before);
          if (finalizedArticleCandidate) return finalizedArticleCandidate;
        }
        const articleClickable = await findClickableHandle(page, config.selectors);
        if (!articleClickable) continue;
        const articlePagesBeforeClick = new Set((context.pages?.() || []).map((entry: any) => entry));
        await humanizeBeforePdfClick(page);
        await dispatchCdpClick(pageCdp, articleClickable.box);
        await sleep(1500);
        const articleDownload = await waitForDownload(outputDir, before, events, Math.max(1, 60000 - (now() - started)));
        const finalizedArticleDownload = tryFinalizeDownloadedPdf(articleDownload, outputDir, docId, articleDownload?.url || articleUrl, before);
        if (finalizedArticleDownload) return finalizedArticleDownload;
        for (const openedPage of (context.pages?.() || []).filter((entry: any) => !articlePagesBeforeClick.has(entry))) {
          rememberPage(openedPage);
          const openedUrl = asOptionalUrl(openedPage.url?.());
          if (!openedUrl) continue;
          const fetchedOpened = await fetchPdfCandidate(openedPage, outputDir, docId, openedUrl, config);
          const finalizedOpened = tryFinalizeDownloadedPdf(fetchedOpened, outputDir, docId, fetchedOpened?.url || openedUrl, before);
          if (finalizedOpened) return finalizedOpened;
        }
      }
      return null;
    };

    if (config.prefer_article_first) {
      const articleFirst = await tryArticleCandidates();
      if (articleFirst) return articleFirst;
    }

    const fetchedDirect = await fetchPdfCandidate(page, outputDir, docId, resolvedUrl, config);
    const finalizedFetchedDirect = tryFinalizeDownloadedPdf(fetchedDirect, outputDir, docId, fetchedDirect?.url || resolvedUrl, before);
    if (finalizedFetchedDirect) return finalizedFetchedDirect;

    const navigationResponse = await navigateForInspectablePage(page, resolvedUrl);
    const direct = await waitForDownload(outputDir, before, events, 5000);
    const finalizedDirect = tryFinalizeDownloadedPdf(direct, outputDir, docId, direct?.url || resolvedUrl, before);
    if (finalizedDirect) return finalizedDirect;
    const inlinePdf = await inlinePdfCompletedDownload(page, navigationResponse, outputDir, docId, resolvedUrl);
    const finalizedInline = tryFinalizeDownloadedPdf(inlinePdf, outputDir, docId, inlinePdf?.url || resolvedUrl, before);
    if (finalizedInline) return finalizedInline;

    const currentPageUrl = asOptionalUrl(page.url?.());
    if (currentPageUrl) {
      const fetchedCurrent = await fetchPdfCandidate(page, outputDir, docId, currentPageUrl, config);
      const finalizedCurrent = tryFinalizeDownloadedPdf(fetchedCurrent, outputDir, docId, fetchedCurrent?.url || currentPageUrl, before);
      if (finalizedCurrent) return finalizedCurrent;
    }

    for (const url of await pagePdfCandidateUrls(page)) {
      if (!candidateUrlAllowed(config, url, docId, page.url?.() || resolvedUrl)) continue;
      const fetchedFromPage = await fetchPdfCandidate(page, outputDir, docId, url, config);
      const finalizedFromPage = tryFinalizeDownloadedPdf(fetchedFromPage, outputDir, docId, fetchedFromPage?.url || url, before);
      if (finalizedFromPage) return finalizedFromPage;
    }

    const clickable = await findClickableHandle(page, config.selectors);
    if (clickable) {
      const pagesBeforeClick = new Set((context.pages?.() || []).map((entry: any) => entry));
      await humanizeBeforePdfClick(page);
      await dispatchCdpClick(pageCdp, clickable.box);
      await sleep(1500);
      const remaining = Math.max(1, 60000 - (now() - started));
      const clickedDownload = await waitForDownload(outputDir, before, events, remaining);
      const finalizedClicked = tryFinalizeDownloadedPdf(clickedDownload, outputDir, docId, clickedDownload?.url || resolvedUrl, before);
      if (finalizedClicked) return finalizedClicked;
      for (const openedPage of (context.pages?.() || []).filter((entry: any) => !pagesBeforeClick.has(entry))) {
        rememberPage(openedPage);
        const openedUrl = asOptionalUrl(openedPage.url?.());
        if (!openedUrl) continue;
        const fetchedOpened = await fetchPdfCandidate(openedPage, outputDir, docId, openedUrl, config);
        const finalizedOpened = tryFinalizeDownloadedPdf(fetchedOpened, outputDir, docId, fetchedOpened?.url || openedUrl, before);
        if (finalizedOpened) return finalizedOpened;
      }
      for (const url of await pagePdfCandidateUrls(page)) {
        if (!candidateUrlAllowed(config, url, docId, page.url?.() || resolvedUrl)) continue;
        const fetchedAfterClick = await fetchPdfCandidate(page, outputDir, docId, url, config);
        const finalizedAfterClick = tryFinalizeDownloadedPdf(fetchedAfterClick, outputDir, docId, fetchedAfterClick?.url || url, before);
        if (finalizedAfterClick) return finalizedAfterClick;
      }
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
        `${config.display_name} PDF download did not complete within 60s after CDP click`,
        { db_slug: config.db_slug, doc_id: docId, pdf_url: resolvedUrl, selector: clickable.selector }
      );
    }

    if (!config.prefer_article_first) {
      const articleFallback = await tryArticleCandidates();
      if (articleFallback) return articleFallback;
    }

    const lateDirect = await waitForDownload(outputDir, before, events, Math.max(1, 60000 - (now() - started)));
    const finalizedLateDirect = tryFinalizeDownloadedPdf(lateDirect, outputDir, docId, lateDirect?.url || resolvedUrl, before);
    if (finalizedLateDirect) return finalizedLateDirect;
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      `${config.display_name} PDF/download link was not found and no direct PDF download started`,
      { db_slug: config.db_slug, doc_id: docId, pdf_url: resolvedUrl, selectors: config.selectors }
    );
  } catch (error) {
    if (error instanceof LiteratureDownloadError) throw error;
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `${config.display_name} browser-session PDF download failed: ${error instanceof Error ? error.message : String(error)}`,
      { db_slug: config.db_slug, doc_id: docId, pdf_url: resolvedUrl }
    );
  } finally {
    for (const entry of [...pagesToClose].reverse()) {
      await entry?.close?.({ runBeforeUnload: false }).catch(() => undefined);
    }
    await browser?.close?.().catch(() => undefined);
  }
}

export async function runPaywalledLiteratureDownloadPdfTool(
  config: PaywalledLiteratureConfig,
  args: Partial<PaywalledLiteratureDownloadPdfArgs>
): Promise<LiteratureDownloadPdfOutput> {
  let docId: string;
  try {
    docId = requireDocId(args?.doc_id);
  } catch (error) {
    return { ...literatureErrorOutput(error), oa_source: "none" } as PaywalledLiteratureDownloadPdfOutput;
  }

  const nowMs = now();
  const quota = assertLiteratureQuota(config.db_slug, nowMs);
  const requestedUrl = requestedPdfUrl(args, docId);
  if (!quota.allowed) {
    const queued = enqueueLiteratureDownload(config.db_slug, docId, requestedUrl, nowMs);
    return emptyOutput({
      ok: true,
      task_id: queued.task_id,
      errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
      message: `${config.db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
    });
  }

  try {
    const outputDir = defaultLiteratureOutputDir(config.db_slug, args?.output_dir);
    const result = await downloadPaywalledLiteraturePdfToDisk(config, docId, requestedUrl, outputDir, args?.profile, args?.cdp_port);
    recordLiteratureDownload(config.db_slug, docId, result.path, result.sha256, result.resolved_url, result.downloaded_at);
    return emptyOutput({
      ok: true,
      path: result.path,
      sha256: result.sha256,
      size: result.size,
      downloaded_at: result.downloaded_at,
      oa_source: "publisher",
      message: "Literature PDF downloaded"
    });
  } catch (error) {
    const outputDir = defaultLiteratureOutputDir(config.db_slug, args?.output_dir);
    const fallback = await tryUnpaywallFallback(config, args, docId, requestedUrl, outputDir);
    if (fallback.result) {
      recordLiteratureDownload(config.db_slug, docId, fallback.result.path, fallback.result.sha256, fallback.result.resolved_url, fallback.result.downloaded_at);
      return emptyOutput({
        ok: true,
        path: fallback.result.path,
        sha256: fallback.result.sha256,
        size: fallback.result.size,
        downloaded_at: fallback.result.downloaded_at,
        oa_source: "unpaywall",
        message: "Literature PDF downloaded via Unpaywall OA copy"
      });
    }
    return errorOutputWithUnpaywallHint(error, fallback);
  }
}

export function registerPaywalledPdfLiteratureDriver(config: PaywalledLiteratureConfig): void {
  registerLiteratureDriver(config.db_slug, async ({ doc_id, requested_url }) => {
    const outputDir = defaultLiteratureOutputDir(config.db_slug);
    const result = await downloadPaywalledLiteraturePdfToDisk(config, requireDocId(doc_id), requested_url, outputDir, config.default_profile);
    return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
  });
}
