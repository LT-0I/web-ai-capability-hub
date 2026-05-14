const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ManagedBrowserLauncher } from "./managedLauncher";

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
  /** Internal: readiness evidence collected before locate/click. */
  pageReadyEvidence?: Record<string, unknown>;
}

export interface ArtifactClickResult {
  path: string;
  sha256: string;
  size: number;
  suggestedFilename?: string;
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
function inViewport(box: any): boolean { return !!box && Number.isFinite(box.y) && box.y >= 0 && box.y <= 1000; }
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
function sha256(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
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

async function walkCandidateFrames(page: any, selector: string, ancestorText?: string, frameTextFilter?: string, scrollIntoView: string = "auto"): Promise<CandidateResult> {
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
      if (!inViewport(box)) { outOfViewport++; continue; }
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

async function walkFollowUpTextRegexFrames(page: any, pattern: string): Promise<CandidateResult> {
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
      const box = await candidateBox(handle, "none");
      if (!inViewport(box)) { outOfViewport++; continue; }
      return { frame, handle, box, frameUrl: frameUrl(frame), matchedAnyElement, matchedAnyFrame: true, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
    }
  }
  return { frame: undefined, handle: undefined, box: undefined, matchedAnyElement, matchedAnyFrame: true, outOfViewport, pageUrl: pageUrl(page), frameCount: frames.length, triedFrames: triedFrames.slice(0, 20) };
}

async function findFollowUpTextRegex(page: any, pattern: string, locateTimeoutMs = 8000): Promise<CandidateResult> {
  const deadline = now() + Math.max(0, locateTimeoutMs);
  let last = await walkFollowUpTextRegexFrames(page, pattern);
  while (!last.matchedAnyElement && now() < deadline) {
    await sleep(Math.min(500, Math.max(0, deadline - now())));
    last = await walkFollowUpTextRegexFrames(page, pattern);
  }
  return last;
}

async function findCandidate(page: any, selector: string, ancestorText?: string, frameTextFilter?: string, scrollIntoView: string = "auto", locateTimeoutMs = 8000): Promise<CandidateResult> {
  const deadline = now() + Math.max(0, locateTimeoutMs);
  let last = await walkCandidateFrames(page, selector, ancestorText, frameTextFilter, scrollIntoView);
  while (!last.matchedAnyElement && now() < deadline) {
    await sleep(Math.min(500, Math.max(0, deadline - now())));
    last = await walkCandidateFrames(page, selector, ancestorText, frameTextFilter, scrollIntoView);
  }
  return last;
}

function notFoundEvidence(candidate: CandidateResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...extra, pageUrl: candidate.pageUrl, frameCount: candidate.frameCount, triedFrames: candidate.triedFrames.slice(0, 20) };
}

type PollDownloadResult = { aborted: true } | { aborted?: false; guid: string; suggestedFilename?: string; filePath: string };

async function pollDownload(browserSession: any, downloadDir: string, timeoutMs: number, signal?: AbortSignal): Promise<PollDownloadResult> {
  if (signal?.aborted) return { aborted: true };
  if (!browserSession?.newBrowserCDPSession) throw new ArtifactClickError("INVALID_ARGS", "Browser-level CDP session is required for Browser.setDownloadBehavior");
  const bcdp = await browserSession.newBrowserCDPSession();
  if (typeof bcdp.send !== "function") throw new ArtifactClickError("INVALID_ARGS", "Browser.setDownloadBehavior is unavailable on this browser session");
  fs.mkdirSync(downloadDir, { recursive: true });
  const downloads = new Map<string, any>();
  bcdp.on?.("Browser.downloadWillBegin", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event, will: true }));
  bcdp.on?.("Browser.downloadProgress", (event: any) => downloads.set(event.guid, { ...(downloads.get(event.guid) || {}), ...event }));
  await bcdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDir, eventsEnabled: true });

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

  const candidate = await findCandidate(page, options.buttonSelector, options.buttonAncestorText, options.frameTextFilter, options.scrollIntoView || "auto", options.locateTimeoutMs ?? 8000);
  if (options.frameTextFilter && !candidate.matchedAnyFrame) throw new ArtifactClickError("IFRAME_NOT_FOUND", "No frame matched --frame-text-filter", notFoundEvidence(candidate, { ...options.pageReadyEvidence, frameTextFilter: options.frameTextFilter }));
  if (!candidate.matchedAnyElement) throw new ArtifactClickError("ELEMENT_NOT_FOUND", "No element matched --button-selector", notFoundEvidence(candidate, { ...options.pageReadyEvidence, selector: options.buttonSelector }));
  if (!candidate.box) throw new ArtifactClickError("ELEMENT_OUT_OF_VIEWPORT", "All matching elements were outside viewport y range [0,1000]", { ...options.pageReadyEvidence, selector: options.buttonSelector, outOfViewport: candidate.outOfViewport });

  const abortDownloads = new AbortController();
  const downloadPromise = pollDownload(browser, path.resolve(options.downloadDir), options.timeoutMs || 60000, abortDownloads.signal)
    .catch((error) => abortDownloads.signal.aborted ? ({ aborted: true as const }) : Promise.reject(error));
  await rawClick(cdp, candidate.box);
  if (options.followUpSelector || options.followUpTextRegex) {
    try {
      await sleep(300);
      const describeFollowUp = options.followUpTextRegex ? "--follow-up-text-regex" : "--follow-up-selector";
      const followValue = options.followUpTextRegex || options.followUpSelector || "";
      const locate = () => options.followUpTextRegex
        ? findFollowUpTextRegex(page, options.followUpTextRegex, options.locateTimeoutMs ?? 8000)
        : findCandidate(page, options.followUpSelector as string, options.followUpAncestorText, undefined, "auto", options.locateTimeoutMs ?? 8000);
      const follow = await locate();
      const until = now() + 3000;
      let found = follow;
      while (found.matchedAnyElement && !found.box && found.outOfViewport === 0 && now() < until) { await sleep(100); found = await locate(); }
      if (!found.matchedAnyElement) throw new ArtifactClickError("ELEMENT_NOT_FOUND", `No element matched ${describeFollowUp}`, notFoundEvidence(found, { ...options.pageReadyEvidence, selector: followValue }));
      if (!found.box) throw new ArtifactClickError("ELEMENT_OUT_OF_VIEWPORT", "Follow-up element was outside viewport y range [0,1000]", { ...options.pageReadyEvidence, selector: followValue });
      await rawClick(cdp, found.box);
    } catch (error) {
      abortDownloads.abort();
      await downloadPromise.catch(() => undefined);
      throw error;
    }
  }

  const downloaded = await downloadPromise;
  if (downloaded.aborted) throw new ArtifactClickError("ARTIFACT_DOWNLOAD_TIMEOUT", "Download polling was aborted before completion");
  let finalPath = downloaded.filePath;
  if (!fs.existsSync(finalPath)) {
    const files = fs.readdirSync(options.downloadDir).map((name: string) => path.join(options.downloadDir, name)).filter((p: string) => fs.statSync(p).isFile());
    if (files.length) finalPath = files.sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }
  const suggested = downloaded.suggestedFilename || path.basename(finalPath);
  if (options.filenamePattern && !globToRegExp(options.filenamePattern).test(suggested) && !globToRegExp(options.filenamePattern).test(path.basename(finalPath))) {
    throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded filename did not match --filename-pattern", { suggestedFilename: suggested, filenamePattern: options.filenamePattern });
  }
  if (options.renameTo) {
    const renamed = path.join(options.downloadDir, options.renameTo);
    fs.renameSync(finalPath, renamed);
    finalPath = renamed;
  }
  const size = fs.statSync(finalPath).size;
  if (options.verifyMinBytes !== undefined && size < options.verifyMinBytes) throw new ArtifactClickError("ARTIFACT_VERIFICATION_FAILED", "Downloaded file is smaller than --verify-min-bytes", { size, verifyMinBytes: options.verifyMinBytes });
  return { path: finalPath, sha256: sha256(finalPath), size, suggestedFilename: suggested, downloadGuid: downloaded.guid, frameUrl: candidate.frameUrl, bbox: candidate.box, elapsedMs: now() - started };
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
    return await artifactClickOnPage(browser, page, { ...options, url: undefined, pageReadyEvidence });
  } finally {
    if (!options.noDisconnect) await browser.close?.().catch(() => undefined);
  }
}
