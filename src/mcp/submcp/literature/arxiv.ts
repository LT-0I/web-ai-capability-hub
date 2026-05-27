const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ConsumerErrorCodes, isConsumerErrorCode } from "../../../consumer/errorCodes";
import { safeProfileName } from "../../../browser/profileStore";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { firstBrowserContext } from "../../../browser/managedPageRouting";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { literatureDownloadsDir } from "../../../runtime/literature/paths";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota, recordLiteratureDownload } from "../../../runtime/literature/quota";
import { ensureDir, safeFilename } from "../../../utils/paths";

export interface LiteratureDownloadPdfArgs {
  doc_id: string;
  profile?: string;
  output_dir?: string;
}

export interface LiteratureDownloadPdfOutput {
  ok: boolean;
  task_id: string | null;
  path: string | null;
  sha256: string | null;
  size: number | null;
  downloaded_at: number | null;
  errorCode: string | null;
  message: string | null;
}

export interface LiteratureDownloadedPdf {
  path: string;
  sha256: string;
  size: number;
  downloaded_at: number;
  resolved_url: string | null;
}

export type LiteraturePdfResolver = (doc_id: string) => Promise<string | null> | string | null;
export type LiteratureRequestedUrlResolver = (doc_id: string) => string | null;

export class LiteratureDownloadError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

export function encodePathPreservingSlash(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function resolveArxivPdfUrl(doc_id: string): string {
  const id = String(doc_id || "").trim().replace(/^arxiv:/i, "").replace(/\.pdf$/i, "");
  if (!id) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  if (/^https?:\/\//i.test(id)) return id;
  return `https://arxiv.org/pdf/${encodePathPreservingSlash(id)}.pdf`;
}

function emptyOutput(overrides: Partial<LiteratureDownloadPdfOutput>): LiteratureDownloadPdfOutput {
  return {
    ok: false,
    task_id: null,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: null,
    message: null,
    ...overrides
  };
}

export function literatureErrorOutput(error: unknown): LiteratureDownloadPdfOutput {
  const candidate = error as { errorCode?: unknown };
  const code = isConsumerErrorCode(candidate?.errorCode) ? candidate.errorCode : ConsumerErrorCodes.UNKNOWN;
  const message = error instanceof Error ? error.message.replace(new RegExp(`^${code}:\\s*`), "") : String(error || code);
  return emptyOutput({ ok: false, errorCode: code, message });
}

export function defaultLiteratureOutputDir(db_slug: string, output_dir?: string): string {
  return ensureDir(path.resolve(output_dir || path.join(literatureDownloadsDir(), db_slug)));
}

function requireDocId(doc_id: unknown): string {
  const value = String(doc_id || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function downloadTargetPath(outputDir: string, docId: string): string {
  return path.resolve(outputDir, `${safeFilename(docId).replace(/\.pdf$/i, "")}.pdf`);
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString() === "%PDF-";
}

function looksLikeHtml(buffer: Buffer, contentType = ""): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  return /^\s*<(?:!doctype\s+html|html|head|body|script|meta)\b/i.test(buffer.subarray(0, 512).toString());
}

function htmlDecode(value: string): string {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function pdfCandidateUrlsFromHtml(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const out: Array<{ url: string; score: number }> = [];
  function add(raw: string | undefined, text = ""): void {
    if (!raw) return;
    const url = absoluteUrl(raw, baseUrl);
    if (!url || seen.has(url)) return;
    const hay = `${url} ${text}`;
    let score = 0;
    if (/\.pdf(?:$|[?#])/i.test(url)) score += 12;
    if (/(?:\/pdf|pdf\/|pdfft|fulltextpdf|download)/i.test(url)) score += 10;
    if (/\bpdf\b|download|click here|全文|下载/i.test(text)) score += 6;
    if (/citation|ris|bibtex|references?|supplement|privacy|terms/i.test(hay)) score -= 20;
    if (score <= 0) return;
    seen.add(url);
    out.push({ url, score });
  }
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] || "";
    const text = htmlDecode((match[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    add(/(?:href|data-pdf-url|data-url)=["']([^"']+)["']/i.exec(attrs)?.[1], `${text} ${/(?:aria-label|title)=["']([^"']+)["']/i.exec(attrs)?.[1] || ""}`);
  }
  for (const pattern of [
    /(?:src|href)=["']([^"']*(?:\.pdf|\/pdf|pdfft|fulltextPDF|download)[^"']*)["']/gi,
    /["'](?:pdfUrl|pdf_url|downloadUrl|download_url)["']\s*:\s*["']([^"']+)["']/gi,
    /<meta\b[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)[^"']*["']/gi
  ]) {
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = pattern.exec(html))) add(urlMatch[1]);
  }
  return out.sort((a, b) => b.score - a.score).map((entry) => entry.url);
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

async function downloadWithBrowserProfile(db_slug: string, doc_id: string, resolved_url: string, output_dir: string, profile: string): Promise<LiteratureDownloadedPdf | null> {
  const launcher = createManagedBrowserLauncher();
  if (!hasRegisteredOrExistingProfileState(launcher, profile)) return null;
  let browser: any;
  try {
    const status = await launcher.launch({ profile });
    browser = await launcher.connectOverCdp(status);
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    const response = await page.goto(resolved_url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await page.waitForLoadState?.("networkidle", { timeout: 10000 }).catch(() => undefined);
    const urls = [String(response?.url?.() || page.url?.() || resolved_url)];
    const pageUrls = await page.evaluate?.(() => Array.from(document.querySelectorAll("a,iframe,embed,object,[data-pdf-url],[data-url]")).map((el) => ({
      href: el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("data-pdf-url") || el.getAttribute("data-url") || "",
      text: ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim(),
      aria: el.getAttribute("aria-label") || el.getAttribute("title") || ""
    }))).catch(() => []);
    for (const entry of pageUrls || []) {
      const url = absoluteUrl(entry.href, page.url?.() || resolved_url);
      if (url && /(?:\.pdf|\/pdf|pdfft|download)/i.test(`${url} ${entry.text} ${entry.aria}`)) urls.push(url);
    }
    for (const url of Array.from(new Set(urls))) {
      const apiResponse = await context.request.get(url, { timeout: 60000, headers: { "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8" } } as any).catch(() => null);
      if (!apiResponse?.ok?.()) continue;
      const buffer = Buffer.from(await apiResponse.body());
      if (!isPdfBuffer(buffer)) continue;
      ensureDir(output_dir);
      const target = downloadTargetPath(output_dir, doc_id);
      fs.writeFileSync(target, buffer);
      return {
        path: target,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        size: buffer.length,
        downloaded_at: Date.now(),
        resolved_url: String(apiResponse.url?.() || url)
      };
    }
    return null;
  } finally {
    await browser?.close?.().catch(() => undefined);
  }
}

async function fetchPdfBufferFollowingHtml(url: string, seen = new Set<string>()): Promise<{ buffer: Buffer; resolved_url: string; content_type: string } | null> {
  if (seen.has(url) || seen.size > 8) return null;
  seen.add(url);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "web-ai-capability-hub-literature-downloader/2.1.0"
    }
  });
  if (!response.ok) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `PDF fetch returned HTTP ${response.status}`,
      { url, status: response.status }
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  if (isPdfBuffer(buffer)) return { buffer, resolved_url: response.url || url, content_type: contentType };
  if (!looksLikeHtml(buffer, contentType)) return { buffer, resolved_url: response.url || url, content_type: contentType };
  const html = buffer.toString("utf8");
  for (const nextUrl of pdfCandidateUrlsFromHtml(html, response.url || url)) {
    const result = await fetchPdfBufferFollowingHtml(nextUrl, seen);
    if (result && isPdfBuffer(result.buffer)) return result;
  }
  return { buffer, resolved_url: response.url || url, content_type: contentType };
}

export async function downloadLiteraturePdfToDisk(
  db_slug: string,
  doc_id: string,
  requested_url: string | null,
  output_dir: string,
  resolvePdfUrl: LiteraturePdfResolver,
  browserProfile?: string,
): Promise<LiteratureDownloadedPdf> {
  const resolved_url = requested_url || await resolvePdfUrl(doc_id);
  if (!resolved_url) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `${db_slug} PDF URL was not found`, { db_slug, doc_id });
  }
  let fetched: { buffer: Buffer; resolved_url: string; content_type: string };
  try {
    const result = await fetchPdfBufferFollowingHtml(resolved_url);
    if (!result) throw new Error("no response body");
    fetched = result;
  } catch (error) {
    if (error instanceof LiteratureDownloadError) throw error;
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `${db_slug} PDF fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      { db_slug, doc_id, url: resolved_url }
    );
  }
  const buffer = fetched.buffer;
  if (buffer.length === 0) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, `${db_slug} PDF download was empty`, { db_slug, doc_id, url: resolved_url });
  }
  if (!isPdfBuffer(buffer)) {
    const browserDownloaded = browserProfile ? await downloadWithBrowserProfile(db_slug, doc_id, fetched.resolved_url || resolved_url, output_dir, browserProfile) : null;
    if (browserDownloaded) return browserDownloaded;
    throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, `${db_slug} download did not produce a PDF artifact`, { db_slug, doc_id, url: fetched.resolved_url || resolved_url, content_type: fetched.content_type });
  }
  ensureDir(output_dir);
  const target = downloadTargetPath(output_dir, doc_id);
  fs.writeFileSync(target, buffer);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const size = fs.statSync(target).size;
  return { path: target, sha256, size, downloaded_at: Date.now(), resolved_url: fetched.resolved_url || resolved_url };
}

export async function runLiteratureDownloadPdfTool(
  db_slug: string,
  args: Partial<LiteratureDownloadPdfArgs>,
  resolvePdfUrl: LiteraturePdfResolver,
  initialRequestedUrl?: LiteratureRequestedUrlResolver,
  browserProfile?: string,
): Promise<LiteratureDownloadPdfOutput> {
  let docId: string;
  try {
    docId = requireDocId(args?.doc_id);
  } catch (error) {
    return literatureErrorOutput(error);
  }
  const now = Date.now();
  const quota = assertLiteratureQuota(db_slug, now);
  const requestedUrl = initialRequestedUrl?.(docId) || null;
  if (!quota.allowed) {
    const queued = enqueueLiteratureDownload(db_slug, docId, requestedUrl, now);
    return emptyOutput({
      ok: true,
      task_id: queued.task_id,
      errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
      message: `${db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
    });
  }
  try {
    const outputDir = defaultLiteratureOutputDir(db_slug, args?.output_dir);
    const result = await downloadLiteraturePdfToDisk(db_slug, docId, requestedUrl, outputDir, resolvePdfUrl, args?.profile || browserProfile);
    recordLiteratureDownload(db_slug, docId, result.path, result.sha256, result.resolved_url, result.downloaded_at);
    return emptyOutput({
      ok: true,
      path: result.path,
      sha256: result.sha256,
      size: result.size,
      downloaded_at: result.downloaded_at,
      message: "Literature PDF downloaded"
    });
  } catch (error) {
    return literatureErrorOutput(error);
  }
}

export function registerPdfLiteratureDriver(
  db_slug: string,
  resolvePdfUrl: LiteraturePdfResolver,
  browserProfile?: string,
): void {
  registerLiteratureDriver(db_slug, async ({ doc_id, requested_url }) => {
    const outputDir = defaultLiteratureOutputDir(db_slug);
    const result = await downloadLiteraturePdfToDisk(db_slug, requireDocId(doc_id), requested_url, outputDir, resolvePdfUrl, browserProfile);
    return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
  });
}

const DB_SLUG = "arxiv";

export async function webAiArxivDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveArxivPdfUrl, resolveArxivPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveArxivPdfUrl);
