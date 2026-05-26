const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { runArtifactClick } from "../../../browser/artifactClick";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";

export const GEMINI_MUSIC_URL = "https://gemini.google.com/app";
export const MUSIC_TOOL_BTN_SELECTOR = 'button[aria-label="🎸 Create music, button, tap to use tool"]';
export const MUSIC_COMPOSER_SELECTOR = 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Describe your track"]';
export const MUSIC_SEND_SELECTOR = 'button[aria-label="Send message"]';
export const MUSIC_DOWNLOAD_BTN_SELECTOR = 'button[aria-label="Download track"]';
export const MUSIC_STOP_SELECTOR = 'button[aria-label="Stop response"]';
export const MUSIC_DESELECT_SELECTOR = 'button[aria-label="Deselect Music"]';
export const MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR = 'button[aria-label="Upload & tools"]';
export const MUSIC_MORE_TOOLS_SUBMENU_SELECTOR = 'button[data-test-id="more-tools-button"]';
export const MUSIC_TOOLS_CREATE_ITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Create music")';

export type GeminiMusicFormat = "mp3" | "video";
export type ArtifactClickLike = (options: Record<string, unknown>) => Promise<any>;

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeErrorMessage(error: any): string { return error?.message || String(error || ""); }
function defaultDownloadDir(): string { return path.join(process.cwd(), "data", "downloads"); }
function sha256File(filePath: string): string { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function ensureDownloadDir(downloadDir?: string): string {
  const resolved = path.resolve(downloadDir || defaultDownloadDir());
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}
async function waitForTimeout(page: any, ms: number): Promise<void> {
  if (typeof page?.waitForTimeout === "function") await page.waitForTimeout(ms).catch(() => undefined);
  else await sleep(ms);
}
async function firstLocator(page: any, selector: string): Promise<any> {
  const loc = page.locator(selector);
  return loc.first?.() || loc;
}
async function requireAndClick(page: any, selector: string, message: string, timeout = 10000): Promise<void> {
  try {
    if (typeof page.waitForSelector === "function") await page.waitForSelector(selector, { state: "visible", timeout });
    const loc = await firstLocator(page, selector);
    await loc.click();
  } catch (error: any) {
    throw new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: ${message} (${selector}) ${safeErrorMessage(error)}`);
  }
}
async function waitForVisible(page: any, selector: string, timeout = 15000): Promise<void> {
  if (typeof page.waitForSelector === "function") await page.waitForSelector(selector, { state: "visible", timeout });
}
async function selectorVisible(page: any, selector: string): Promise<boolean> {
  try {
    if (typeof page.locator === "function") {
      const loc = await firstLocator(page, selector);
      if (typeof loc.count === "function" && await loc.count() < 1) return false;
      if (typeof loc.isVisible === "function") return Boolean(await loc.isVisible());
      return true;
    }
  } catch { return false; }
  return false;
}
async function openGeminiMusicUploadToolsMenu(page: any): Promise<void> {
  try {
    await waitForVisible(page, MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000);
  } catch (error: any) {
    throw new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Gemini Music Upload & tools button was not found (${MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR}) ${safeErrorMessage(error)}`);
  }
  try {
    const loc = await firstLocator(page, MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR);
    await loc.click({ force: true });
  } catch (error: any) {
    throw new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Gemini Music Upload & tools button was not found (${MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR}) ${safeErrorMessage(error)}`);
  }
  try {
    await waitForVisible(page, '[role="menuitem"][aria-label^="Upload files"], [role="menuitemcheckbox"], button[aria-label="More tools"]', 5000);
  } catch (error: any) {
    throw new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Gemini Music Upload & tools menu did not open ([role="menuitem"][aria-label^="Upload files"], [role="menuitemcheckbox"], button[aria-label="More tools"]) ${safeErrorMessage(error)}`);
  }
  if (!(await selectorVisible(page, MUSIC_TOOLS_CREATE_ITEM_SELECTOR))) {
    try {
      await requireAndClick(page, MUSIC_MORE_TOOLS_SUBMENU_SELECTOR, "Gemini Music More tools sub-menu trigger was not found", 5000);
      await waitForVisible(page, MUSIC_TOOLS_CREATE_ITEM_SELECTOR, 5000);
    } catch (error: any) {
      throw new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Gemini Music More tools sub-menu did not expose Create music (${MUSIC_MORE_TOOLS_SUBMENU_SELECTOR} -> ${MUSIC_TOOLS_CREATE_ITEM_SELECTOR}) ${safeErrorMessage(error)}`);
    }
  }
}
async function fillComposer(page: any, selector: string, value: string): Promise<void> {
  const loc = await firstLocator(page, selector);
  await loc.waitFor?.({ state: "visible", timeout: 15000 });
  await loc.click?.();
  if (typeof loc.fill === "function") await loc.fill(value);
  else await page.keyboard?.type(value);
}

export async function stepActivateMusicTool(page: any): Promise<{ music_tool_active: boolean }> {
  await openGeminiMusicUploadToolsMenu(page);
  await requireAndClick(page, MUSIC_TOOLS_CREATE_ITEM_SELECTOR, "Gemini Music Create music menuitemcheckbox was not found", 10000);
  await waitForVisible(page, MUSIC_DESELECT_SELECTOR, 15000);
  return { music_tool_active: true };
}

export async function stepGenerateTrack(page: any, args: { prompt: string; confirmed?: boolean; timeoutMs?: number }): Promise<Record<string, unknown>> {
  if (!args.confirmed) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD,
      error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD,
      action: "gemini_music_generate",
      message: "Gemini music generation sends user content and requires confirmed: true."
    };
  }
  await fillComposer(page, MUSIC_COMPOSER_SELECTOR, args.prompt);
  await page.keyboard?.press?.("Escape");
  const send = await firstLocator(page, MUSIC_SEND_SELECTOR);
  await send.click();
  await waitForTrackReady(page, args.timeoutMs || 180000);
  return { status: "generating" };
}

export async function waitForTrackReady(page: any, timeoutMs = 180000): Promise<void> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (Date.now() < deadline) {
    const downloadReady = await selectorVisible(page, MUSIC_DOWNLOAD_BTN_SELECTOR);
    const stopVisible = await selectorVisible(page, MUSIC_STOP_SELECTOR);
    if (downloadReady && !stopVisible) return;
    await waitForTimeout(page, 1000);
  }
  throw new Error(`${ConsumerErrorCodes.COMMAND_TIMEOUT}: Gemini music generation did not finish before timeout`);
}

export async function stepDownloadTrack(page: any, args: { profile: string; tabUrlContains: string; downloadDir?: string; format?: GeminiMusicFormat; timeoutMs?: number; locateTimeoutMs?: number; prerenderWaitMs?: number; artifactClick?: ArtifactClickLike }): Promise<Record<string, unknown>> {
  const format = args.format || "mp3";
  const downloadDir = ensureDownloadDir(args.downloadDir);
  const followUpTextRegex = format === "mp3" ? "MP3" : "Video";
  const timeoutMs = Math.min(Number(args.timeoutMs || 60000), 120000);
  const locateTimeoutMs = Math.min(Number(args.locateTimeoutMs || 20000), timeoutMs);
  try {
    const result = await (args.artifactClick || runArtifactClick)({
      profile: args.profile,
      tabUrlContains: args.tabUrlContains || page?.url?.() || GEMINI_MUSIC_URL,
      buttonSelector: MUSIC_DOWNLOAD_BTN_SELECTOR,
      followUpTextRegex,
      downloadDir,
      filenamePattern: format === "mp3" ? "\\.mp3$" : "\\.(mp4|webm|mov|m4v)$",
      timeoutMs,
      locateTimeoutMs,
      prerenderWaitMs: Number(args.prerenderWaitMs || 1500),
      noDisconnect: true
    });
    const savedPath = result.path || result.savedPath || "";
    const stat = savedPath && fs.existsSync(savedPath) ? fs.statSync(savedPath) : undefined;
    return {
      savedPath,
      sha256: result.sha256 || (savedPath && fs.existsSync(savedPath) ? sha256File(savedPath) : ""),
      byteSize: result.size ?? result.size_bytes ?? result.sizeBytes ?? stat?.size ?? 0,
      format
    };
  } catch (error: any) {
    if (error?.errorCode === ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT || error?.errorCode === "ARTIFACT_DOWNLOAD_TIMEOUT" || /ARTIFACT_DOWNLOAD_TIMEOUT|timeout/i.test(safeErrorMessage(error))) {
      return { ok: false, errorCode: ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, error_code: ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, savedPath: "", sha256: "", byteSize: 0, format };
    }
    throw error;
  }
}

export async function stepShareTrack(_page: any, args: { confirmed?: boolean } = {}): Promise<Record<string, unknown>> {
  if (!args.confirmed) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD,
      error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD,
      action: "share_track",
      message: "Gemini music share UI is not opened without explicit confirmation."
    };
  }
  return { ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, action: "share_track" };
}
