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

export interface PaywalledLiteratureDownloadPdfArgs {
  doc_id: string;
  pdf_url?: string;
  profile?: string;
  output_dir?: string;
  cdp_port?: number;
}

export interface PaywalledLiteratureConfig {
  db_slug: string;
  display_name: string;
  default_profile: string;
  selectors: string[];
  metadata_tool: string | null;
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

function now(): number { return Date.now(); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
  if (!buffer?.length) return null;
  ensureDir(downloadDir);
  const filePath = path.resolve(downloadDir, `inline-${Date.now()}-${safePdfBasename(docId)}`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, url: responseUrl };
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
  try {
    browser = await connectResearchBrowser(launcher, selectedProfile, cdp_port);
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    const { pageCdp, events } = await armDownloadBehavior(browser, page, outputDir);
    const started = now();

    const navigationResponse = await navigateForDownload(page, resolvedUrl);
    const direct = await waitForDownload(outputDir, before, events, 5000);
    const finalizedDirect = tryFinalizeDownloadedPdf(direct, outputDir, docId, resolvedUrl, before);
    if (finalizedDirect) return finalizedDirect;
    const inlinePdf = await inlinePdfCompletedDownload(page, navigationResponse, outputDir, docId, resolvedUrl);
    const finalizedInline = tryFinalizeDownloadedPdf(inlinePdf, outputDir, docId, resolvedUrl, before);
    if (finalizedInline) return finalizedInline;

    const clickable = await findClickableHandle(page, config.selectors);
    if (clickable) {
      await dispatchCdpClick(pageCdp, clickable.box);
      const remaining = Math.max(1, 60000 - (now() - started));
      const clickedDownload = await waitForDownload(outputDir, before, events, remaining);
      const finalizedClicked = tryFinalizeDownloadedPdf(clickedDownload, outputDir, docId, resolvedUrl, before);
      if (finalizedClicked) return finalizedClicked;
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
        `${config.display_name} PDF download did not complete within 60s after CDP click`,
        { db_slug: config.db_slug, doc_id: docId, pdf_url: resolvedUrl, selector: clickable.selector }
      );
    }

    const lateDirect = await waitForDownload(outputDir, before, events, Math.max(1, 60000 - (now() - started)));
    const finalizedLateDirect = tryFinalizeDownloadedPdf(lateDirect, outputDir, docId, resolvedUrl, before);
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
    return literatureErrorOutput(error);
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
      message: "Literature PDF downloaded"
    });
  } catch (error) {
    return literatureErrorOutput(error);
  }
}

export function registerPaywalledPdfLiteratureDriver(config: PaywalledLiteratureConfig): void {
  registerLiteratureDriver(config.db_slug, async ({ doc_id, requested_url }) => {
    const outputDir = defaultLiteratureOutputDir(config.db_slug);
    const result = await downloadPaywalledLiteraturePdfToDisk(config, requireDocId(doc_id), requested_url, outputDir, config.default_profile);
    return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
  });
}
