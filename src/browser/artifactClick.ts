const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "./managedLauncher";
import { verifyOoxmlPackage } from "../verifiers/docxMin";

export type ArtifactClickErrorCode = "IFRAME_NOT_FOUND" | "ELEMENT_NOT_FOUND" | "ELEMENT_OUT_OF_VIEWPORT" | "ARTIFACT_DOWNLOAD_TIMEOUT" | "ARTIFACT_VERIFICATION_FAILED" | "INVALID_ARGS";

export class ArtifactClickError extends Error {
  constructor(readonly errorCode: ArtifactClickErrorCode, message: string, readonly evidence: Record<string, unknown> = {}) { super(message); }
}

export interface ArtifactClickOptions {
  profile: string;
  url?: string;
  tabUrlContains?: string;
  buttonSelector: string;
  buttonAncestorText?: string;
  scrollIntoView?: "auto" | `y:${number}` | "none" | string;
  followUpSelector?: string;
  followUpTextRegex?: string;
  followUpAncestorText?: string;
  frameTextFilter?: string;
  downloadDir: string;
  filenamePattern?: string;
  renameTo?: string;
  verifyMinBytes?: number;
  timeoutMs?: number;
  locateTimeoutMs?: number;
  frameMinCount?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  prerenderWaitMs?: number;
  scrollMainToY?: number;
  scrollMainWaitMs?: number;
  noDisconnect?: boolean;
  maxViewportY?: number;
  openPanelIfMissing?: "chatgpt-canvas";
  /** Internal: readiness evidence collected before locate/click. */
  pageReadyEvidence?: Record<string, unknown>;
}

export interface ArtifactClickResult {
  path: string;
  sha256: string;
  size: number;
  suggestedFilename?: string;
  downloadFilename?: string;
  warn?: string;
  downloadGuid: string;
  frameUrl?: string;
  bbox: { x: number; y: number; width: number; height: number };
  elapsedMs: number;
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function now(): number { return Date.now(); }
function pageUrl(page: any): string {
  try { return String(typeof page?.url === "function" ? page.url() : page?.url || ""); } catch { return ""; }
}
function frameUrl(frame: any): string {
  try { return String(typeof frame?.url === "function" ? frame.url() : frame?.url || ""); } catch { return ""; }
}
function framesOf(page: any): any[] {
  const frames = typeof page.frames === "function" ? page.frames() : page.frames || [];
  const out: any[] = [];
  const visit = (frame: any) => {
    if (!frame || out.includes(frame)) return;
    out.push(frame);
    const children = typeof frame.childFrames === "function" ? frame.childFrames() : frame.childFrames || [];
    for (const child of children) visit(child);
  };
  for (const frame of frames) visit(frame);
  if (!out.length && page.mainFrame) visit(typeof page.mainFrame === "function" ? page.mainFrame() : page.mainFrame);
  return out;
}
async function frameText(frame: any): Promise<string> {
  try { return String(await frame.locator("body").innerText?.({ timeout: 1000 }) ?? await frame.textContent?.("body") ?? ""); } catch { return ""; }
}
async function elementContextText(handle: any): Promise<string> {
  try {
    return String(await handle.evaluate?.((el: any) => {
      let p = el;
      let text = "";
      for (let i = 0; p && i < 8; i++, p = p.parentElement) {
        const attrs = [p.getAttribute?.("data-message-id"), p.getAttribute?.("role")].filter(Boolean).join(" ");
        text += `${attrs} ${(p.innerText || p.textContent || "").slice(0, 1200)}\n`;
      }
      return text;
    }) ?? "");
  } catch { return ""; }
}
async function candidateBox(handle: any, scrollIntoView: string = "auto"): Promise<any> {
  if (scrollIntoView !== "none") {
    try { await handle.scrollIntoViewIfNeeded?.({ timeout: 2000 }); } catch { /* scroll best effort */ }
  }
  return await handle.boundingBox?.();
}
function inViewport(box: any, maxY = 1000): boolean { return !!box && Number.isFinite(box.y) && box.y >= 0 && box.y <= maxY; }
async function rawClick(cdp: any, box: any): Promise<void> {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function filenameMatchesPattern(name: string, pattern: string): boolean {
  if (globToRegExp(pattern).test(name)) return true;
  try { return new RegExp(pattern).test(name); } catch { return false; }
}
function sha256(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function safeDownloadBasename(name: string): string {
  const parsed = path.parse(path.basename(String(name || "")).replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").trim());
  const stem = parsed.name.replace(/[\s,;:]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const ext = parsed.ext.replace(/[\s,;:]+/g, "_").replace(/_+/g, "_");
  return `${stem}${ext}`.trim();
}
function verifiedGovernedArtifact(filePath: string, governedDir: string, format: GovernedFormat = "png"): { ok: true; realPath: string } | { ok: false } {
  try {
    if (!format) return { ok: false };
    if (!fs.existsSync(filePath)) return { ok: false };
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return { ok: false };
    const fd = fs.openSync(filePath, "r");
    try {
      if (format === "png") {
        const header = Buffer.alloc(12);
        const bytesRead = fs.readSync(fd, header, 0, 12, 0);
        if (imageMagicExt(header.subarray(0, bytesRead)) === null) return { ok: false };
      } else {
        const header = Buffer.alloc(4);
        if (fs.readSync(fd, header, 0, 4, 0) !== 4) return { ok: false };
        if (!header.equals(OOXML_MAGIC)) return { ok: false };
      }
    } finally {
      fs.closeSync(fd);
    }
    const realFile = fs.realpathSync(filePath);
    const realDir = fs.realpathSync(path.resolve(governedDir));
    if (path.dirname(realFile) !== realDir) return { ok: false };
    if (format !== "png") {
      const ext = format === "ooxml-docx" ? "docx" : format === "ooxml-pptx" ? "pptx" : "xlsx";
      if (!verifyOoxmlPackage(filePath, ext).ok) return { ok: false };
    }
    return { ok: true, realPath: realFile };
  } catch {
    return { ok: false };
  }
}
function fallbackNameFromPattern(filePath: string, filenamePattern?: string): string {
  const digest = sha256(filePath).slice(0, 12);
  const normalized = (filenamePattern || "").replace(/\\/g, "");
  const ext = /\.([A-Za-z0-9]+)\$?$/.exec(normalized)?.[1] || "bin";
  return `download-${digest}.${ext}`;
}
function ensureArgs(options: ArtifactClickOptions): void {
  if (!options.profile || !options.buttonSelector || !options.downloadDir) throw new ArtifactClickError("INVALID_ARGS", "browser:artifact-click requires --profile, --button-selector, and --download-dir");
  if (options.followUpTextRegex) {
    try { new RegExp(options.followUpTextRegex, "i"); }
    catch (error) { throw new ArtifactClickError("INVALID_ARGS", "browser:artifact-click --follow-up-text-regex must be a valid regular expression", { followUpTextRegex: options.followUpTextRegex, error: error instanceof Error ? error.message : String(error) }); }
  }
  if (!path.isAbsolute(options.downloadDir)) throw new ArtifactClickError("INVALID_ARGS", "browser:artifact-click --download-dir must be an absolute path");
  if (options.renameTo && path.basename(options.renameTo) !== options.renameTo) throw new ArtifactClickError("INVALID_ARGS", "browser:artifact-click --rename-to must be a basename, not a path");
}

interface TriedFrameEvidence { url: string; hadSelectorMatch: boolean; hadFrameTextFilterMatch?: boolean }
interface CandidateResult { frame: any; handle: any; box: any; frameUrl?: string; matchedAnyElement: boolean; matchedAnyFrame: boolean; outOfViewport: number; pageUrl: string; frameCount: number; triedFrames: TriedFrameEvidence[] }

async function walkCandidateFrames(page: any, selector: string, ancestorText?: string, frameTextFilter?: string, scrollIntoView: string = "auto", maxViewportY = 1000): Promise<CandidateResult> {
  let matchedAnyElement = false;
  let matchedAnyFrame = !frameTextFilter;
  let outOfViewport = 0;
  const frames = framesOf(page);
  const triedFrames: TriedFrameEvidence[] = [];
  for (const frame of frames) {
    const evidence: TriedFrameEvidence = { url: frameUrl(frame), hadSelectorMatch: false };
    const text = frameTextFilter ? await frameText(frame) : "";
    if (frameTextFilter) {
      evidence.hadFrameTextFilterMatch = text.includes(frameTextFilter);
      if (!evidence.hadFrameTextFilterMatch) { triedFrames.push(evidence); continue; }
    }
    matchedAnyFrame = true;
    const locator = frame.locator(selector);
    const handles = typeof locator.elementHandles === "function" ? await locator.elementHandles() : [];
    evidence.hadSelectorMatch = handles.length > 0;
    triedFrames.push(evidence);
    for (const handle of handles) {
      matchedAnyElement = true;
      if (ancestorText && !(await elementContextText(handle)).includes(ancestorText)) continue;
      const box = await candidateBox(handle, scrollIntoView);
      if (!inViewport(box, maxViewportY)) { outOfViewport++; continue; }
      return { frame, handle, box, frameUrl: frameUrl(frame), matchedAnyElement, matchedAnyFrame, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
    }
  }
  return { frame: undefined, handle: undefined, box: undefined, matchedAnyElement, matchedAnyFrame, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
}

const FOLLOW_UP_TEXT_SELECTOR = '[role="menuitem"], button, a, [role="button"], li';

async function elementCombinedText(handle: any): Promise<string> {
  try {
    return String(await handle.evaluate?.((el: any) => [
      el.innerText || el.textContent || "",
      el.getAttribute?.("aria-label") || "",
      el.getAttribute?.("href") || ""
    ].join(" ").trim()) ?? "");
  } catch { return ""; }
}

async function walkFollowUpTextRegexFrames(page: any, pattern: string, maxViewportY = 1000): Promise<CandidateResult> {
  const regex = new RegExp(pattern, "i");
  let matchedAnyElement = false;
  let outOfViewport = 0;
  const frames = framesOf(page);
  const triedFrames: TriedFrameEvidence[] = [];
  for (const frame of frames) {
    const evidence: TriedFrameEvidence = { url: frameUrl(frame), hadSelectorMatch: false };
    const locator = frame.locator(FOLLOW_UP_TEXT_SELECTOR);
    const handles = typeof locator.elementHandles === "function" ? await locator.elementHandles() : [];
    evidence.hadSelectorMatch = handles.length > 0;
    triedFrames.push(evidence);
    for (const handle of handles) {
      const text = await elementCombinedText(handle);
      if (!regex.test(text)) continue;
      matchedAnyElement = true;
      let box = await candidateBox(handle, "none");
      if (!inViewport(box, maxViewportY)) {
        try { await handle.scrollIntoViewIfNeeded?.({ timeout: 1500 }); } catch {}
        box = await handle.boundingBox?.();
      }
      if (!inViewport(box, maxViewportY)) { outOfViewport++; continue; }
      return { frame, handle, box, frameUrl: frameUrl(frame), matchedAnyElement, matchedAnyFrame: true, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
    }
  }
  return { frame: undefined, handle: undefined, box: undefined, matchedAnyElement, matchedAnyFrame: true, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
}

async function findFollowUpTextRegex(page: any, pattern: string, locateTimeoutMs = 8000, maxViewportY = 1000): Promise<CandidateResult> {
  const deadline = now() + Math.max(0, locateTimeoutMs);
  let last = await walkFollowUpTextRegexFrames(page, pattern, maxViewportY);
  while (!last.matchedAnyElement && now() < deadline) {
    await sleep(Math.min(500, Math.max(0, deadline - now())));
    last = await walkFollowUpTextRegexFrames(page, pattern, maxViewportY);
  }
  return last;
}

async function findCandidate(page: any, selector: string, ancestorText?: string, frameTextFilter?: string, scrollIntoView: string = "auto", locateTimeoutMs = 8000, maxViewportY = 1000): Promise<CandidateResult> {
  const deadline = now() + Math.max(0, locateTimeoutMs);
  let last = await walkCandidateFrames(page, selector, ancestorText, frameTextFilter, scrollIntoView, maxViewportY);
  while (!last.matchedAnyElement && now() < deadline) {
    await sleep(Math.min(500, Math.max(0, deadline - now())));
    last = await walkCandidateFrames(page, selector, ancestorText, frameTextFilter, scrollIntoView, maxViewportY);
  }
  return last;
}

function notFoundEvidence(candidate: CandidateResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extra, pageUrl: candidate.pageUrl, frameCount: candidate.frameCount, triedFrames: candidate.triedFrames.slice(0, 20) };
}

type GovernedFormat = "png" | "ooxml-docx" | "ooxml-pptx" | "ooxml-xlsx" | null;

type PollDownloadResult = { aborted: true } | { aborted?: false; guid: string; suggestedFilename?: string; filePath: string };

interface ResolvedDownload { finalPath: string; suggested: string; warn?: string }

function newestFreshFile(downloadDir: string, runStartedMs?: number): string | undefined {
  const started = runStartedMs ?? Number.NEGATIVE_INFINITY;
  const ended = now();
  const files = fs.readdirSync(downloadDir)
    .map((name: string) => path.join(downloadDir, name))
    .filter((p: string) => {
      const stat = fs.statSync(p);
      return stat.isFile() && stat.mtimeMs >= started && stat.mtimeMs <= ended;
    });
  return files.sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

export async function recoverGovernedArtifactFromDisk(governedDir: string, runStartedMs: number, settleMs = 5000, format: GovernedFormat = "png"): Promise<{ ok: true; realPath: string } | { ok: false }> {
  const deadline = now() + settleMs;
  while (true) {
    try {
      const dir = governedDir;
      if (!fs.existsSync(dir)) return { ok: false };
      const ended = now();
      const files = fs.readdirSync(dir)
        .map((name: string) => path.join(dir, name))
        .map((p: string) => {
          try {
            return { p, stat: fs.statSync(p) };
          } catch {
            return undefined;
          }
        })
        .filter((entry): entry is { p: string; stat: any } => !!entry && entry.stat.isFile() && entry.stat.mtimeMs >= runStartedMs && entry.stat.mtimeMs <= ended)
        .filter((entry) => verifiedGovernedArtifact(entry.p, governedDir, format).ok);
      const chosen = files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
      if (chosen) return { ok: true, realPath: fs.realpathSync(chosen.p) };
    } catch {
      return { ok: false };
    }
    if (now() >= deadline) return { ok: false };
    await sleep(250);
  }
}

function resolveAndRenameDownloaded(downloaded: Exclude<PollDownloadResult, { aborted: true }>, options: ArtifactClickOptions, runStartedMs?: number): ResolvedDownload {
  let finalPath = downloaded.filePath;
  if (!fs.existsSync(finalPath)) {
    const freshFallback = runStartedMs === undefined ? undefined : newestFreshFile(options.downloadDir, runStartedMs);
    const files = runStartedMs === undefined
      ? fs.readdirSync(options.downloadDir).map((name: string) => path.join(options.downloadDir, name)).filter((p: string) => fs.statSync(p).isFile())
      : freshFallback ? [freshFallback] : [];
    if (files.length) finalPath = files.sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }
  const suggested = downloaded.suggestedFilename || path.basename(finalPath);
  if (options.filenamePattern && downloaded.suggestedFilename && !filenameMatchesPattern(suggested, options.filenamePattern)) {
    throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded filename did not match --filename-pattern", { suggestedFilename: suggested, filenamePattern: options.filenamePattern });
  }
  let warn: string | undefined;
  if (!options.renameTo) {
    const safeSuggested = safeDownloadBasename(downloaded.suggestedFilename || "");
    const targetName = safeSuggested || fallbackNameFromPattern(finalPath, options.filenamePattern);
    if (!safeSuggested) warn = "WARN: Browser.downloadWillBegin did not include suggestedFilename; used deterministic fallback download filename.";
    const targetPath = path.join(options.downloadDir, targetName);
    if (path.resolve(targetPath) !== path.resolve(finalPath)) {
      if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
      fs.renameSync(finalPath, targetPath);
      finalPath = targetPath;
    }
  }
  if (options.renameTo) {
    const renamed = path.join(options.downloadDir, options.renameTo);
    fs.renameSync(finalPath, renamed);
    finalPath = renamed;
  }
  return { finalPath, suggested, warn };
}

function governedVerificationFormat(options: ArtifactClickOptions): GovernedFormat {
  const pat = options.filenamePattern || "";
  if (/png/i.test(pat)) return (options.followUpSelector || options.followUpTextRegex) ? "png" : null;
  const selector = options.buttonSelector || "";
  const nativeOfficeDownloadSelector = /behavior-btn|aria-label[\^$*|~]?=["']Download|has-text\(["']Download/i.test(selector);
  if (!nativeOfficeDownloadSelector) return null;
  if (/docx/i.test(pat)) return "ooxml-docx";
  if (/pptx/i.test(pat)) return "ooxml-pptx";
  if (/xlsx/i.test(pat)) return "ooxml-xlsx";
  return null;
}

function buildArtifactClickResult(resolved: ResolvedDownload, downloaded: Exclude<PollDownloadResult, { aborted: true }>, options: ArtifactClickOptions, candidate: CandidateResult, started: number, warnOverride?: string): ArtifactClickResult {
  if (options.filenamePattern && !filenameMatchesPattern(path.basename(resolved.finalPath), options.filenamePattern)) {
    throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded filename did not match --filename-pattern", { suggestedFilename: resolved.suggested, filenamePattern: options.filenamePattern });
  }
  const size = fs.statSync(resolved.finalPath).size;
  if (options.verifyMinBytes !== undefined && size < options.verifyMinBytes) throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded file is smaller than --verify-min-bytes", { size, verifyMinBytes: options.verifyMinBytes });
  const fmt = governedVerificationFormat(options);
  if (fmt && !verifiedGovernedArtifact(resolved.finalPath, path.resolve(options.downloadDir), fmt).ok) {
    throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded artifact failed governed on-disk verification", { path: resolved.finalPath, format: fmt });
  }
  return { path: resolved.finalPath, sha256: sha256(resolved.finalPath), size, suggestedFilename: downloaded.suggestedFilename, downloadFilename: path.basename(resolved.finalPath), warn: warnOverride || resolved.warn, downloadGuid: downloaded.guid, frameUrl: candidate.frameUrl, bbox: candidate.box, elapsedMs: now() - started };
}

const downloadEventsBySession = new WeakMap<object, Map<string, any>>();

interface NetworkCaptureState {
  responses: Map<string, { url: string; mimeType: string }>;
  finished: Set<string>;
  finishedAt: Map<string, number>;
  bodies: Map<string, { url: string; finishedAt: number; buf: Buffer }>;
  pointerUrls: string[];
  bufferedBytes: number;
  lastBodyReadFailReason?: string;
  responseReceivedSeen: number;
  imageGatePassed: number;
  streamArmAttempts: number;
  eagerRawBodyEntries: number;
  resourceTreeMatches: number;
  resourceContentRetrieved: number;
}

const networkCaptureBySession = new WeakMap<object, NetworkCaptureState>();
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const OOXML_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function imageMagicExt(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length >= 8 && PNG_MAGIC.equals(buf.subarray(0, 8))) return "png";
  if (buf.length >= 3 && JPEG_MAGIC.equals(buf.subarray(0, 3))) return "jpg";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  return null;
}

function originPath(url: string): string | false {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch {
    return false;
  }
}

function extractPointerUrlFromJsonBody(body: Buffer): string | undefined {
  try {
    const parsed = JSON.parse(body.toString());
    const downloadUrl = parsed?.download_url || parsed?.url || parsed?.data?.download_url;
    return downloadUrl ? String(downloadUrl) : undefined;
  } catch {
    return undefined;
  }
}

function matchesKnownPointer(url: string, pointerUrls: string[]): boolean {
  const metaOriginPath = originPath(url);
  return pointerUrls.some((downloadUrl) => {
    const downloadOriginPath = originPath(downloadUrl);
    return Boolean(metaOriginPath && downloadOriginPath && metaOriginPath === downloadOriginPath);
  });
}

function isChatgptPointerHop2(url: string): boolean {
  if (!url) return false;
  return url.includes("/backend-api/estuary/content");
}

async function armDownloadBehavior(browserSession: any, pageCdp: any, downloadDir: string, page?: any): Promise<any> {
  if (!browserSession?.newBrowserCDPSession) throw new ArtifactClickError("INVALID_ARGS", "Browser-level CDP session is required for Browser.setDownloadBehavior");
  const bcdp = await browserSession.newBrowserCDPSession();
  if (typeof bcdp.send !== "function") throw new ArtifactClickError("INVALID_ARGS", "Browser.setDownloadBehavior is unavailable on this browser session");
  fs.mkdirSync(downloadDir, { recursive: true });
  const downloads = new Map<string, any>();
  bcdp.on?.("Browser.downloadWillBegin", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event, will: true }));
  bcdp.on?.("Browser.downloadProgress", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event }));
  downloadEventsBySession.set(bcdp, downloads);
  await bcdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true });
  await pageCdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true }).catch(() => undefined);
  await pageCdp.send("Network.enable", {}).catch(() => undefined);
  let bodyCdp: any = pageCdp;
  try {
    const ctx = typeof page?.context === "function" ? page.context() : undefined;
    const fresh = ctx && typeof ctx.newCDPSession === "function" ? await ctx.newCDPSession(page) : undefined;
    if (fresh && typeof fresh.send === "function") {
      bodyCdp = fresh;
      await bodyCdp.send("Network.enable", {}).catch(() => undefined);
    }
  } catch {
    bodyCdp = pageCdp;
  }
  const networkCapture: NetworkCaptureState = { responses: new Map<string, { url: string; mimeType: string }>(), finished: new Set<string>(), finishedAt: new Map<string, number>(), bodies: new Map<string, { url: string; finishedAt: number; buf: Buffer }>(), pointerUrls: [], bufferedBytes: 0, responseReceivedSeen: 0, imageGatePassed: 0, streamArmAttempts: 0, eagerRawBodyEntries: 0, resourceTreeMatches: 0, resourceContentRetrieved: 0 };
  const eagerRawBody = async (sess: any, requestId: string, meta: { url: string; mimeType: string } | undefined, finishedAt: number, sessionId?: string) => {
    try {
      const url = String(meta?.url || "");
      if (!url) return;
      networkCapture.eagerRawBodyEntries += 1;
      if (url.includes("backend-api/files/download/")) {
        const r = sessionId
          ? await sess.send("Network.getResponseBody", { requestId }, sessionId).catch(() => ({} as any))
          : await sess.send("Network.getResponseBody", { requestId }).catch(() => ({} as any));
        if (!r?.body) return;
        const pointer = extractPointerUrlFromJsonBody(Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8"));
        if (pointer) networkCapture.pointerUrls.push(pointer);
        return;
      }
      const shouldTryBody = matchesKnownPointer(url, networkCapture.pointerUrls)
        || String(meta?.mimeType || "").toLowerCase().startsWith("image/")
        || isChatgptPointerHop2(url);
      if (!shouldTryBody) return;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = sessionId
          ? await sess.send("Network.getResponseBody", { requestId }, sessionId).catch(() => { networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "rejected"; return {} as any; })
          : await sess.send("Network.getResponseBody", { requestId }).catch(() => { networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "rejected"; return {} as any; });
        if (r?.body) {
          const buf = Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8");
          if (imageMagicExt(buf) !== null) {
            networkCapture.bodies.set(requestId, { url, finishedAt, buf });
            networkCapture.bufferedBytes += buf.length;
            return;
          }
          networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "no-magic";
          return;
        }
        networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "empty";
        await sleep(8);
      }
    } catch {
      // Passive capture only; misses fall through to existing governed recovery.
    }
  };
  const registerRawNetworkCaptureOn = (sess: any, sessionId?: string) => {
    sess.on?.("Network.responseReceived", (event: any) => {
      if (sessionId && event?.sessionId && String(event.sessionId) !== sessionId) return;
      if (!event?.requestId) return;
      networkCapture.responseReceivedSeen += 1;
      const requestId = String(event.requestId);
      const url = String(event.response?.url || "");
      const mime = String(event.response?.mimeType || "").toLowerCase();
      const prior = networkCapture.responses.get(requestId);
      const effectiveMime = mime || (prior?.mimeType ?? "");
      networkCapture.responses.set(requestId, { url, mimeType: effectiveMime });
      const shouldStream = mime.startsWith("image/")
        || matchesKnownPointer(url, networkCapture.pointerUrls)
        || isChatgptPointerHop2(url);
      if (!shouldStream) return;
      networkCapture.imageGatePassed += 1;
      void (async () => {
        try {
          networkCapture.streamArmAttempts += 1;
          await sess.send("Network.streamResourceContent", { requestId }).catch(() => undefined);
          const chunks: Buffer[] = [];
          while (true) {
            const chunk: any = await sess.send("IO.read", { handle: requestId }).catch(() => undefined);
            if (!chunk) { networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "stream-rejected"; return; }
            if (chunk.data) chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8"));
            if (chunk.eof) { await sess.send("IO.close", { handle: requestId }).catch(() => undefined); break; }
          }
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) { networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "stream-empty"; return; }
          if (imageMagicExt(buf) === null) { networkCapture.lastBodyReadFailReason = networkCapture.lastBodyReadFailReason || "stream-magic"; return; }
          networkCapture.bodies.set(requestId, { url, finishedAt: now(), buf });
          networkCapture.bufferedBytes += buf.length;
        } catch {
          // Passive capture only; misses fall through to existing R8 Pass-1/2 + governed recovery.
        }
      })();
    });
    sess.on?.("Network.loadingFinished", (event: any) => {
      if (sessionId && event?.sessionId && String(event.sessionId) !== sessionId) return;
      if (!event?.requestId) return;
      networkCapture.finished.add(String(event.requestId));
      networkCapture.finishedAt.set(String(event.requestId), now());
      void eagerRawBody(sess, String(event.requestId), networkCapture.responses.get(String(event.requestId)), networkCapture.finishedAt.get(String(event.requestId)) ?? now(), sessionId);
    });
    sess.on?.("Network.responseReceivedExtraInfo", (event: any) => {
      if (sessionId && event?.sessionId && String(event.sessionId) !== sessionId) return;
      if (!event?.requestId) return;
      const requestId = String(event.requestId);
      const headers = event?.headers || {};
      const headerMime = String(
        headers["content-type"]
        || headers["Content-Type"]
        || headers["CONTENT-TYPE"]
        || ""
      ).toLowerCase().split(";")[0].trim();
      if (!headerMime) return;
      const existing = networkCapture.responses.get(requestId);
      if (existing && !existing.mimeType) {
        networkCapture.responses.set(requestId, { url: existing.url, mimeType: headerMime });
      } else if (!existing) {
        networkCapture.responses.set(requestId, { url: "", mimeType: headerMime });
      }
    });
  };
  const registerRawNetworkCapture = (sessionId?: string) => registerRawNetworkCaptureOn(pageCdp, sessionId);
  registerRawNetworkCaptureOn(bodyCdp);
  if (bodyCdp !== pageCdp) registerRawNetworkCaptureOn(pageCdp);
  pageCdp.on?.("Target.attachedToTarget", (event: any) => {
    const sessionId = event?.sessionId ? String(event.sessionId) : "";
    if (!sessionId) return;
    pageCdp.send("Network.enable", {}).catch(() => undefined);
    registerRawNetworkCapture(sessionId);
  });
  await pageCdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => undefined);
  bcdp.on?.("Target.attachedToTarget", (event: any) => {
    const sessionId = event?.sessionId ? String(event.sessionId) : "";
    if (!sessionId) return;
    bcdp.send("Network.enable", {}).catch(() => undefined);
    registerRawNetworkCaptureOn(bcdp, sessionId);
  });
  await bcdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => undefined);
  try {
    let seq = 0;
    const onResponse = async (response: any) => {
      try {
        const u = String(typeof response?.url === "function" ? response.url() : response?.url || "");
        if (!u) return;
        if (u.includes("backend-api/files/download/")) {
          const text = typeof response?.text === "function" ? await response.text() : "";
          const pointer = extractPointerUrlFromJsonBody(Buffer.from(text, "utf8"));
          if (pointer) networkCapture.pointerUrls.push(pointer);
          return;
        }
        const headers = typeof response?.headers === "function" ? response.headers() : {};
        const contentType = String(headers?.["content-type"] || headers?.["Content-Type"] || "").toLowerCase();
        const shouldTryBody = matchesKnownPointer(u, networkCapture.pointerUrls) || contentType.startsWith("image/");
        if (!shouldTryBody) return;
        const body = typeof response?.body === "function" ? await response.body() : undefined;
        const buf = Buffer.isBuffer(body) ? body : body ? Buffer.from(body) : undefined;
        if (!buf || imageMagicExt(buf) === null) return;
        const request = typeof response?.request === "function" ? response.request() : undefined;
        const key = "pw-" + (request?._guid ?? String(seq++));
        networkCapture.bodies.set(key, { url: u, finishedAt: now(), buf });
        networkCapture.bufferedBytes += buf.length;
      } catch {
        // Passive observer only; any miss falls through to the unchanged R8 scan.
      }
    };
    const pwCtx = (typeof page?.context === "function" ? page.context() : undefined);
    if (typeof pwCtx?.on === "function") pwCtx.on("response", onResponse);
    if (typeof page?.on === "function") page.on("response", onResponse);
    if (typeof pwCtx?.on === "function") pwCtx.on("page", (p: any) => { try { if (typeof p?.on === "function") p.on("response", onResponse); } catch {} });
  } catch {
    // Fake/offline harnesses may not expose Playwright event surfaces.
  }
  networkCaptureBySession.set(pageCdp, networkCapture);
  return bcdp;
}

async function harvestPageResourceTree(page: any, pageCdp: any, capture: NetworkCaptureState, runStartedMs: number): Promise<void> {
  if (!pageCdp || typeof pageCdp.send !== "function") return;
  let harvestCdp: any = pageCdp;
  let opened = false;
  try {
    const ctx = typeof page?.context === "function" ? page.context() : undefined;
    const fresh = ctx && typeof ctx.newCDPSession === "function" ? await ctx.newCDPSession(page) : undefined;
    if (fresh && typeof fresh.send === "function") { harvestCdp = fresh; opened = true; }
  } catch {
    harvestCdp = pageCdp;
  }
  try {
    if (opened) await harvestCdp.send("Page.enable").catch(() => undefined);
    const tree: any = await harvestCdp.send("Page.getResourceTree").catch(() => undefined);
    if (!tree || !tree.frameTree) return;
    const matches: { frameId: string; url: string; mimeType: string }[] = [];
    const visit = (frame: any) => {
      if (!frame) return;
      const frameId = String(frame?.frame?.id || "");
      const resources = Array.isArray(frame.resources) ? frame.resources : [];
      for (const r of resources) {
        const url = String(r?.url || "");
        if (!url) continue;
        const isHop2 = isChatgptPointerHop2(url);
        const isPointerMatch = matchesKnownPointer(url, capture.pointerUrls);
        if (!isHop2 && !isPointerMatch) continue;
        if (frameId) matches.push({ frameId, url, mimeType: String(r?.mimeType || "") });
      }
      const children = Array.isArray(frame.childFrames) ? frame.childFrames : [];
      for (const child of children) visit(child);
    };
    visit(tree.frameTree);
    capture.resourceTreeMatches += matches.length;
    // R19b: URL-parameter discriminator for current ChatGPT image generation output.
    // Fresh generated images carry `&p=fs&` (full-size) and lack `gizmo_id=` / `&p=gpp&`.
    // Stale gizmo persona-badge images carry `gizmo_id=` and/or `&p=gpp&`.
    // Both signals live in the URL itself — no page.evaluate, preserves offline FakeCDP contract.
    const isFreshHop2Url = (url: string): boolean => {
      if (!url) return false;
      if (!isChatgptPointerHop2(url)) return false;
      if (/[?&]gizmo_id=/.test(url)) return false;
      if (/[?&]p=gpp(&|$)/.test(url)) return false;
      return /[?&]p=fs(&|$)/.test(url);
    };
    matches.sort((a, b) => {
      const rank = (url: string): number => {
        if (isFreshHop2Url(url)) return 0;
        if (matchesKnownPointer(url, capture.pointerUrls)) return 1;
        return 2;
      };
      return rank(a.url) - rank(b.url);
    });
    const [pointerMatchCount, hop2Count, ambiguousMultiHop2] = (() => {
      const pointerMatches = matches.filter((m) => matchesKnownPointer(m.url, capture.pointerUrls)).length;
      const hop2Matches = matches.filter((m) => isChatgptPointerHop2(m.url)).length;
      const freshMatches = matches.filter((m) => isFreshHop2Url(m.url)).length;
      return [pointerMatches, hop2Matches, freshMatches === 0 && pointerMatches === 0 && hop2Matches >= 2] as const;
    })();
    for (const m of matches) {
      const r: any = await harvestCdp.send("Page.getResourceContent", { frameId: m.frameId, url: m.url }).catch(() => undefined);
      if (!r || typeof r.content !== "string" || !r.content) continue;
      const buf = Buffer.from(r.content, r.base64Encoded ? "base64" : "utf8");
      if (!buf.length) continue;
      if (imageMagicExt(buf) === null) continue;
      capture.resourceContentRetrieved += 1;
      if (ambiguousMultiHop2) continue;
      const key = `pageres-${capture.bodies.size}`;
      capture.bodies.set(key, { url: m.url, finishedAt: runStartedMs, buf });
      capture.bufferedBytes += buf.length;
    }
  } finally {
    if (opened && typeof harvestCdp.detach === "function") await harvestCdp.detach().catch(() => undefined);
  }
}

async function materializeNetworkCapturedArtifact(page: any, pageCdp: any, downloadDir: string, runStartedMs: number, expectedFormat: GovernedFormat): Promise<boolean> {
  const capture = pageCdp && typeof pageCdp === "object" ? networkCaptureBySession.get(pageCdp) : undefined;
  if (!capture) return false;
  if ((expectedFormat || "png") === "png") {
    await harvestPageResourceTree(page, pageCdp, capture, runStartedMs);
  }
  const candidates = Array.from(capture.finished)
    .map((requestId) => ({ requestId, finishedAt: capture.finishedAt.get(requestId) ?? 0 }))
    .filter(({ finishedAt }) => finishedAt >= runStartedMs && finishedAt <= now())
    .sort((a, b) => b.finishedAt - a.finishedAt);
  const normalizedExpectedFormat = expectedFormat || "png";
  const expectedExt = normalizedExpectedFormat === "png" ? "png" : normalizedExpectedFormat.replace("ooxml-", "");
  const hasExpectedMagic = (buf: Buffer): boolean => normalizedExpectedFormat === "png"
    ? imageMagicExt(buf) !== null
    : OOXML_MAGIC.equals(buf.subarray(0, OOXML_MAGIC.length));
  const expectedFilename = (requestId: string, buf: Buffer): string => `network-${requestId}.${normalizedExpectedFormat === "png" ? (imageMagicExt(buf) || "png") : expectedExt}`;
  const downloadUrls: string[] = [...capture.pointerUrls];
  for (const { requestId } of candidates) {
    const meta = capture.responses.get(requestId);
    if (!String(meta?.url || "").includes("backend-api/files/download/")) continue;
    const r = await pageCdp.send("Network.getResponseBody", { requestId }).catch(() => ({} as any));
    if (!r?.body) continue;
    try {
      const parsed = JSON.parse(Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8").toString("utf8"));
      if (String(meta?.mimeType || "").toLowerCase().startsWith("application/json") || parsed) {
        const downloadUrl = parsed?.download_url || parsed?.url || parsed?.data?.download_url;
        if (downloadUrl) downloadUrls.push(String(downloadUrl));
      }
    } catch {
      // Not a JSON pointer body; keep the no-synthesis path honest.
    }
  }
  for (const [requestId, body] of Array.from(capture.bodies.entries())
    .filter(([, entry]) => entry.finishedAt >= runStartedMs && entry.finishedAt <= now())
    .sort((a, b) => b[1].finishedAt - a[1].finishedAt)) {
    const matchesPointer = matchesKnownPointer(body.url, downloadUrls) || imageMagicExt(body.buf) !== null;
    if (!matchesPointer) continue;
    if (!hasExpectedMagic(body.buf)) continue;
    fs.writeFileSync(path.join(downloadDir, expectedFilename(requestId, body.buf)), body.buf);
    return true;
  }
  for (const { requestId } of candidates) {
    const meta = capture.responses.get(requestId);
    const metaOriginPath = originPath(String(meta?.url || ""));
    const matchesPointer = downloadUrls.some((downloadUrl) => {
      const downloadOriginPath = originPath(downloadUrl);
      return Boolean(metaOriginPath && downloadOriginPath && metaOriginPath === downloadOriginPath);
    })
      || (downloadUrls.length > 0 && String(meta?.mimeType || "").toLowerCase().startsWith("image/"));
    if (!matchesPointer) continue;
    const r = await pageCdp.send("Network.getResponseBody", { requestId }).catch(() => ({} as any));
    if (!r?.body) continue;
    const buf = Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8");
    if (!hasExpectedMagic(buf)) continue;
    capture.bodies.set(requestId, { url: String(meta?.url || ""), finishedAt: capture.finishedAt.get(requestId) ?? now(), buf });
    capture.bufferedBytes += buf.length;
    fs.writeFileSync(path.join(downloadDir, expectedFilename(requestId, buf)), buf);
    return true;
  }
  for (const { requestId } of candidates) {
    const meta = capture.responses.get(requestId);
    const r = await pageCdp.send("Network.getResponseBody", { requestId }).catch(() => ({} as any));
    if (!r?.body) continue;
    const buf = Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8");
    const hasMagic = hasExpectedMagic(buf);
    if (normalizedExpectedFormat === "png" && !String(meta?.mimeType || "").toLowerCase().startsWith("image/") && !hasMagic) continue;
    if (!hasMagic) continue;
    capture.bodies.set(requestId, { url: String(meta?.url || ""), finishedAt: capture.finishedAt.get(requestId) ?? now(), buf });
    capture.bufferedBytes += buf.length;
    fs.writeFileSync(path.join(downloadDir, expectedFilename(requestId, buf)), buf);
    return true;
  }
  return false;
}

function attachNetworkCaptureEvidence(pageCdp: any, error: ArtifactClickError): void {
  const capture = pageCdp && typeof pageCdp === "object" ? networkCaptureBySession.get(pageCdp) : undefined;
  if (!capture) return;
  error.evidence.bufferedBytes = capture.bufferedBytes;
  error.evidence["bodies.size"] = capture.bodies.size;
  error.evidence.responseReceivedSeen = capture.responseReceivedSeen;
  error.evidence.imageGatePassed = capture.imageGatePassed;
  error.evidence.streamArmAttempts = capture.streamArmAttempts;
  error.evidence.eagerRawBodyEntries = capture.eagerRawBodyEntries;
  error.evidence.resourceTreeMatches = capture.resourceTreeMatches;
  error.evidence.resourceContentRetrieved = capture.resourceContentRetrieved;
  if (capture.lastBodyReadFailReason) error.evidence.bodyReadFail = capture.lastBodyReadFailReason;
}

async function pollDownload(bcdp: any, downloadDir: string, timeoutMs: number, signal?: AbortSignal): Promise<PollDownloadResult> {
  if (signal?.aborted) return { aborted: true };
  const downloads = downloadEventsBySession.get(bcdp);
  if (!downloads) throw new ArtifactClickError("INVALID_ARGS", "Browser.setDownloadBehavior must be armed before polling downloads");

  const waitSlice = async () => { await sleep(50); return signal?.aborted ? { aborted: true as const } : undefined; };
  const beginDeadline = now() + Math.max(1, Math.floor(timeoutMs / 2));
  let guid: string | undefined;
  while (now() < beginDeadline) {
    if (signal?.aborted) return { aborted: true };
    for (const [key, event] of downloads.entries()) if (event.will) { guid = key; break; }
    if (guid) break;
    const aborted = await waitSlice();
    if (aborted) return aborted;
  }
  if (!guid) throw new ArtifactClickError("ARTIFACT_DOWNLOAD_TIMEOUT", "No Browser.downloadWillBegin event was observed", { timeoutMs });

  const completeDeadline = now() + Math.max(1, timeoutMs - Math.floor(timeoutMs / 2));
  while (now() < completeDeadline) {
    if (signal?.aborted) return { aborted: true };
    const event = downloads.get(guid);
    if (event?.state === "completed") {
      const filePath = path.join(downloadDir, guid);
      return { guid, suggestedFilename: event.suggestedFilename || event.url?.split("/").pop(), filePath };
    }
    const aborted = await waitSlice();
    if (aborted) return aborted;
  }
  throw new ArtifactClickError("ARTIFACT_DOWNLOAD_TIMEOUT", "Download did not complete before timeout", { guid, timeoutMs });
}

export async function artifactClickOnPage(browser: any, page: any, options: ArtifactClickOptions): Promise<ArtifactClickResult> {
  ensureArgs(options);
  const started = now();
  if (options.url) await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs || 60000 });
  const cdp = await page.context?.()?.newCDPSession?.(page) || await page.context?.()?.new_cdp_session?.(page);
  if (!cdp?.send) throw new ArtifactClickError("INVALID_ARGS", "Page CDP session is required for raw Input.dispatchMouseEvent");

  const maxViewportY = options.maxViewportY ?? options.viewportHeight ?? 1000;
  const candidate = await findCandidate(page, options.buttonSelector, options.buttonAncestorText, options.frameTextFilter, options.scrollIntoView || "auto", options.locateTimeoutMs ?? 8000, maxViewportY);
  if (options.frameTextFilter && !candidate.matchedAnyFrame) throw new ArtifactClickError("IFRAME_NOT_FOUND", "No frame matched --frame-text-filter", notFoundEvidence(candidate, { ...options.pageReadyEvidence, frameTextFilter: options.frameTextFilter }));
  if (!candidate.matchedAnyElement) throw new ArtifactClickError("ELEMENT_NOT_FOUND", "No element matched --button-selector", notFoundEvidence(candidate, { ...options.pageReadyEvidence, selector: options.buttonSelector }));
  if (!candidate.box) throw new ArtifactClickError("ELEMENT_OUT_OF_VIEWPORT", `All matching elements were outside viewport y range [0,${maxViewportY}]`, { ...options.pageReadyEvidence, selector: options.buttonSelector, outOfViewport: candidate.outOfViewport, maxViewportY });

  const abortDownloads = new AbortController();
  const downloadDir = path.resolve(options.downloadDir);
  const armedBcdp = await armDownloadBehavior(browser, cdp, downloadDir, page);
  const downloadPromise = pollDownload(armedBcdp, downloadDir, options.timeoutMs || 60000, abortDownloads.signal)
    .catch((error) => abortDownloads.signal.aborted ? ({ aborted: true as const }) : Promise.reject(error));
  await rawClick(cdp, candidate.box);
  if (options.followUpSelector || options.followUpTextRegex) {
    try {
      await sleep(300);
      const describeFollowUp = options.followUpTextRegex ? "--follow-up-text-regex" : "--follow-up-selector";
      const followValue = options.followUpTextRegex || options.followUpSelector || "";
      const locate = () => options.followUpTextRegex
        ? findFollowUpTextRegex(page, options.followUpTextRegex, options.locateTimeoutMs ?? 8000, maxViewportY)
        : findCandidate(page, options.followUpSelector as string, options.followUpAncestorText, undefined, "auto", options.locateTimeoutMs ?? 8000, maxViewportY);
      const follow = await locate();
      const until = now() + 3000;
      let found = follow;
      while (found.matchedAnyElement && !found.box && found.outOfViewport === 0 && now() < until) { await sleep(100); found = await locate(); }
      if (!found.matchedAnyElement) throw new ArtifactClickError("ELEMENT_NOT_FOUND", `No element matched ${describeFollowUp}`, notFoundEvidence(found, { ...options.pageReadyEvidence, selector: followValue }));
      if (!found.box) throw new ArtifactClickError("ELEMENT_OUT_OF_VIEWPORT", `Follow-up element was outside viewport y range [0,${maxViewportY}]`, { ...options.pageReadyEvidence, selector: followValue, maxViewportY });
      await rawClick(cdp, found.box);
    } catch (error) {
      const graceMs = Math.min(options.timeoutMs ?? 60000, 8000);
      const settled = await Promise.race([downloadPromise.catch(() => undefined), sleep(graceMs).then(() => undefined)]);
      if (settled && !settled.aborted && settled.filePath) {
        try {
          const resolved = resolveAndRenameDownloaded(settled, options, started);
          if (verifiedGovernedArtifact(resolved.finalPath, path.resolve(options.downloadDir), governedVerificationFormat(options)).ok) {
            return buildArtifactClickResult(resolved, settled, options, candidate, started, "follow-up download control not found, but the governed artifact was delivered by the browser");
          }
        } catch {
          /* fall through to disk fallback below */
        }
      }
      await materializeNetworkCapturedArtifact(page, cdp, path.resolve(options.downloadDir), started, governedVerificationFormat(options));
      const recovered = await recoverGovernedArtifactFromDisk(path.resolve(options.downloadDir), started, 5000, governedVerificationFormat(options));
      if (recovered.ok) {
        const finalPath = recovered.realPath;
        const size = fs.statSync(finalPath).size;
        abortDownloads.abort();
        await downloadPromise.catch(() => undefined);
        return {
          path: finalPath,
          sha256: sha256(finalPath),
          size,
          suggestedFilename: settled && !settled.aborted ? settled.suggestedFilename : undefined,
          downloadFilename: path.basename(finalPath),
          warn: "follow-up download control not found, but the governed artifact was delivered by the browser",
          downloadGuid: settled && !settled.aborted && settled.guid ? settled.guid : "",
          frameUrl: candidate.frameUrl,
          bbox: candidate.box,
          elapsedMs: now() - started
        };
      }
      abortDownloads.abort();
      await downloadPromise.catch(() => undefined);
      throw error;
    }
  }

  const recoverFollowUpDeliveredArtifact = async (originalError: ArtifactClickError): Promise<ArtifactClickResult> => {
    await materializeNetworkCapturedArtifact(page, cdp, path.resolve(options.downloadDir), started, governedVerificationFormat(options));
    const recovered = await recoverGovernedArtifactFromDisk(path.resolve(options.downloadDir), started, 5000, governedVerificationFormat(options));
    if (recovered.ok) {
      const finalPath = recovered.realPath;
      const size = fs.statSync(finalPath).size;
      abortDownloads.abort();
      await downloadPromise.catch(() => undefined);
      return {
        path: finalPath,
        sha256: sha256(finalPath),
        size,
        suggestedFilename: undefined,
        downloadFilename: path.basename(finalPath),
        warn: "follow-up download control not found, but the governed artifact was delivered by the browser",
        downloadGuid: "",
        frameUrl: candidate.frameUrl,
        bbox: candidate.box,
        elapsedMs: now() - started
      };
    }
    attachNetworkCaptureEvidence(cdp, originalError);
    throw originalError;
  };

  const hasFollowUp = !!(options.followUpSelector || options.followUpTextRegex);
  let downloaded: PollDownloadResult;
  try {
    downloaded = await downloadPromise;
  } catch (error) {
    if (hasFollowUp && error instanceof ArtifactClickError && error.errorCode === "ARTIFACT_DOWNLOAD_TIMEOUT") {
      return await recoverFollowUpDeliveredArtifact(error);
    }
    throw error;
  }
  if (downloaded.aborted) {
    const error = new ArtifactClickError("ARTIFACT_DOWNLOAD_TIMEOUT", "Download polling was aborted before completion");
    if (hasFollowUp) return await recoverFollowUpDeliveredArtifact(error);
    throw error;
  }
  const resolved = resolveAndRenameDownloaded(downloaded, options);
  return buildArtifactClickResult(resolved, downloaded, options, candidate, started);
}

function matchesUrlTarget(current: string, target: string): boolean {
  if (!current || !target) return false;
  if (current.includes(target)) return true;
  try {
    const targetUrl = new URL(target);
    return targetUrl.pathname !== "/" && current.includes(targetUrl.pathname);
  } catch {
    return current.includes(target);
  }
}

export async function selectArtifactClickPage(context: any, options: Pick<ArtifactClickOptions, "url" | "tabUrlContains">): Promise<any> {
  const pages = typeof context.pages === "function" ? context.pages() : context.pages || [];
  if (options.url) {
    const matches = pages.filter((candidate: any) => matchesUrlTarget(pageUrl(candidate), options.url as string));
    if (!matches.length) throw new ArtifactClickError("INVALID_ARGS", "No existing browser tab matched --url; pass an already-open conversation tab or use --tab-url-contains", { url: options.url, openPageUrls: pages.map(pageUrl).slice(0, 20) });
    const page = matches.map((candidate: any) => ({ page: candidate, frames: framesOf(candidate).length })).sort((a: any, b: any) => b.frames - a.frames)[0].page;
    if (!matchesUrlTarget(pageUrl(page), options.url)) await page.goto?.(options.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  }
  if (options.tabUrlContains) {
    const matches = pages.filter((candidate: any) => pageUrl(candidate).includes(options.tabUrlContains as string));
    if (!matches.length) throw new ArtifactClickError("INVALID_ARGS", "No existing browser tab matched --tab-url-contains", { tabUrlContains: options.tabUrlContains, openPageUrls: pages.map(pageUrl).slice(0, 20) });
    return matches.map((candidate: any) => ({ page: candidate, frames: framesOf(candidate).length })).sort((a: any, b: any) => b.frames - a.frames)[0].page;
  }
  throw new ArtifactClickError("INVALID_ARGS", "browser:artifact-click requires --url or --tab-url-contains to avoid selecting a random tab");
}

async function waitForLoadStateBestEffort(page: any, state: string, timeout: number): Promise<void> {
  if (typeof page?.waitForLoadState !== "function") return;
  try { await page.waitForLoadState(state, { timeout }); } catch { /* best effort for reused live tabs */ }
}

async function locatorVisibleCount(page: any, selector: string): Promise<number> {
  try {
    const locator = page.locator?.(selector);
    if (!locator) return 0;
    const count = typeof locator.count === "function" ? await locator.count() : 0;
    let visible = 0;
    for (let i = 0; i < count; i++) {
      const item = typeof locator.nth === "function" ? locator.nth(i) : locator;
      if (typeof item.isVisible !== "function" || await item.isVisible().catch(() => false)) visible++;
    }
    return visible;
  } catch {
    return 0;
  }
}

async function clickFirstVisible(page: any, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator?.(selector);
      if (!locator) continue;
      const count = typeof locator.count === "function" ? await locator.count() : 0;
      for (let i = 0; i < count; i++) {
        const item = typeof locator.nth === "function" ? locator.nth(i) : locator;
        const visible = typeof item.isVisible !== "function" || await item.isVisible().catch(() => false);
        if (!visible) continue;
        await item.click?.({ timeout: 3000 }).catch(async () => item.click?.());
        return true;
      }
    } catch {
      // Try the next candidate selector.
    }
  }
  return false;
}

async function openChatgptCanvasPanelIfMissing(page: any, downloadSelector: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const before = await locatorVisibleCount(page, downloadSelector);
  if (before > 0) return { canvasPanelAlreadyOpen: true, downloadControlsBefore: before };
  const clicked = await clickFirstVisible(page, [
    'button[aria-label*="canvas" i]',
    'a[aria-label*="canvas" i]',
    '[role="button"][aria-label*="canvas" i]',
    'button:has-text("Open in canvas")',
    'button:has-text("Canvas")',
    'a:has-text("Canvas")',
    '[role="button"]:has-text("Canvas")'
  ]);
  if (clicked) {
    const deadline = now() + Math.min(Math.max(timeoutMs, 1000), 10000);
    while (now() < deadline && await locatorVisibleCount(page, downloadSelector) === 0) await sleep(250);
  }
  return { canvasPanelAlreadyOpen: false, attemptedCanvasPanelOpen: clicked, downloadControlsBefore: before, downloadControlsAfter: await locatorVisibleCount(page, downloadSelector) };
}

export async function waitForArtifactPageReady(page: any, options: ArtifactClickOptions): Promise<Record<string, unknown>> {
  const evidence: Record<string, unknown> = {};
  const viewportRequested = options.viewportWidth !== undefined || options.viewportHeight !== undefined;
  if (viewportRequested && typeof page?.setViewportSize === "function") {
    const current = typeof page?.viewportSize === "function" ? page.viewportSize() : undefined;
    const width = options.viewportWidth ?? 1500;
    const height = options.viewportHeight ?? 1000;
    if (!current || current.width !== width || current.height !== height) await page.setViewportSize({ width, height });
  }
  await waitForLoadStateBestEffort(page, "networkidle", 3000);
  await waitForLoadStateBestEffort(page, "domcontentloaded", options.timeoutMs || 60000);
  if ((options.prerenderWaitMs ?? 0) > 0) await sleep(options.prerenderWaitMs as number);
  if (options.scrollMainToY !== undefined) {
    const result = typeof page?.evaluate === "function" ? await page.evaluate((top) => {
      const els = Array.from(document.querySelectorAll('*')).filter(
        el => el.scrollHeight > el.clientHeight + 50
           && getComputedStyle(el).overflowY === 'auto');
      const main = els.find(el => el.getBoundingClientRect().x > 200 && el.clientHeight > 900);
      if (main) main.scrollTop = top;
      return { ranScroll: !!main, candidates: els.length };
    }, options.scrollMainToY) : { ranScroll: false, candidates: 0 };
    evidence.scroll = { ...(result || {}), scrolledTo: options.scrollMainToY };
    await sleep(options.scrollMainWaitMs ?? 1000);
  }
  const minIframeCount = options.frameMinCount ?? 1;
  if (framesOf(page).length < 3 && minIframeCount > 0) {
    const deadline = now() + 3000;
    while (now() < deadline && Math.max(0, framesOf(page).length - 1) < minIframeCount) await sleep(100);
  }
  if (options.openPanelIfMissing === "chatgpt-canvas") {
    evidence.openPanelIfMissing = await openChatgptCanvasPanelIfMissing(page, options.buttonSelector, options.locateTimeoutMs ?? 8000);
  }
  return evidence;
}

export async function runArtifactClick(options: ArtifactClickOptions): Promise<ArtifactClickResult> {
  ensureArgs(options);
  const launcher = new ManagedBrowserLauncher();
  const status = await launcher.launch({ profile: options.profile });
  const browser = await launcher.connectOverCdp(status);
  try {
    const context = browser.contexts()[0] || await browser.newContext?.({ acceptDownloads: true });
    const page = await selectArtifactClickPage(context, options);
    const pageReadyEvidence = await waitForArtifactPageReady(page, options);
    const maxViewportY = options.viewportHeight ?? 1000;
    return await artifactClickOnPage(browser, page, { ...options, url: undefined, pageReadyEvidence, maxViewportY });
  } finally {
    if (!options.noDisconnect) await browser.close?.().catch(() => undefined);
  }
}
