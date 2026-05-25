import * as fs from "node:fs";
import * as path from "node:path";
import { objectSchema, scalar } from "../../../utils/schema";
import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../../../consumer/errorCodes";
import { getBackend } from "../../../browser/backends";
import { runArtifactClick } from "../../../browser/artifactClick";
import { defaultHttpBridgeUrlForProfile } from "../../../runtime/extension/httpBridgeClient";
import { assertPromptAllowed } from "../../../safety/promptDeny";
import { BrowserToolRuntime, ToolSpec, acquireProfileLease, releaseProfileLease, withManagedPage } from "../../tools";
import {
  GEMINI_MUSIC_URL,
  MUSIC_COMPOSER_SELECTOR,
  MUSIC_DOWNLOAD_BTN_SELECTOR,
  MUSIC_SEND_SELECTOR,
  MUSIC_STOP_SELECTOR,
  MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR,
  MUSIC_MORE_TOOLS_SUBMENU_SELECTOR,
  GeminiMusicFormat,
  MUSIC_DESELECT_SELECTOR,
  MUSIC_TOOLS_CREATE_ITEM_SELECTOR,
  stepActivateMusicTool,
  stepDownloadTrack,
  stepGenerateTrack
} from "./flow";

const DEFAULT_MUSIC_PROFILE = "gemini-9225";

type GenerateArgs = { prompt: string; profile?: string; confirmed?: boolean; tab_url_contains?: string; timeout_ms?: number; backend?: "managed-cdp" | "extension-assisted-cdp" };
type DownloadArgs = { tab_url_contains: string; profile?: string; download_dir?: string; format?: GeminiMusicFormat };
type StatusArgs = { tab_url_contains: string; profile?: string };

function backendSchema(description: string): Record<string, unknown> {
  return { ...scalar.enum(["managed-cdp", "extension-assisted-cdp"], description), default: "extension-assisted-cdp" };
}

const generateInput = objectSchema<GenerateArgs>({
  prompt: scalar.string("Benign instrumental track prompt for Gemini Music / Lyria"),
  profile: { ...scalar.string("Managed Gemini browser profile"), default: DEFAULT_MUSIC_PROFILE },
  confirmed: { ...scalar.boolean("Required true to send the music generation prompt"), default: false },
  tab_url_contains: scalar.string("Optional Gemini conversation URL fragment"),
  timeout_ms: scalar.number("Generation readiness timeout in milliseconds"),
  backend: backendSchema("Browser backend for Gemini Music perception; defaults to extension-assisted-cdp")
}, ["prompt", "profile"]);

const downloadInput = objectSchema<DownloadArgs>({
  tab_url_contains: scalar.string("Gemini conversation URL fragment containing the generated track"),
  profile: { ...scalar.string("Managed Gemini browser profile"), default: DEFAULT_MUSIC_PROFILE },
  download_dir: scalar.string("Directory where the downloaded music artifact is saved"),
  format: { ...scalar.enum(["mp3", "video"], "Music artifact format"), default: "mp3" }
}, ["tab_url_contains", "profile"]);

const taskStatusInput = objectSchema<StatusArgs>({
  tab_url_contains: scalar.string("Gemini conversation URL fragment to inspect"),
  profile: { ...scalar.string("Managed Gemini browser profile"), default: DEFAULT_MUSIC_PROFILE }
}, ["tab_url_contains", "profile"]);

function withDefaultProfile<T extends Record<string, unknown>>(args: T): T & { profile: string } {
  return { ...args, profile: String(args.profile || DEFAULT_MUSIC_PROFILE) };
}
function targetUrlForTab(tabUrlContains?: string): string {
  if (typeof tabUrlContains !== "string" || !tabUrlContains.trim()) return GEMINI_MUSIC_URL;
  if (/^https?:\/\//.test(tabUrlContains)) return tabUrlContains;
  if (/^[A-Za-z0-9_-]{6,}$/.test(tabUrlContains)) return `https://gemini.google.com/app/${tabUrlContains}`;
  return GEMINI_MUSIC_URL;
}
function guardResponse(action: string): Record<string, unknown> {
  return { ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, action };
}
function musicErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { task_id: "", status: "error", conversation_url: "", ok: false, errorCode, error_code: errorCode, message, ...extra };
}
function extensionHttpBridgeUrlForMusicArgs(args: any): string {
  return process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL
    || args.http_bridge_url
    || defaultHttpBridgeUrlForProfile(args.profile);
}
function extensionErrorCode(error: any, fallback: ConsumerErrorCode = ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED): ConsumerErrorCode {
  return isConsumerErrorCode(error?.errorCode) ? error.errorCode : fallback;
}
function musicDownloadDir(args: any): string {
  const resolved = path.resolve(args.download_dir || path.join(process.cwd(), "data", "downloads"));
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}
async function extensionGeminiMusicPage(args: any, backend: any): Promise<any> {
  const requested = args.url || args.tab_url_contains;
  const page = requested
    ? await backend.claimTab({ url: requested })
    : await backend.newTab({ url: GEMINI_MUSIC_URL, background: false });
  const target = targetUrlForTab(requested);
  await page.navigate(target, { waitUntil: "domcontentloaded", timeoutMs: Math.min(args.timeout_ms || 60000, 30000) });
  return page;
}
async function activateMusicToolWithExtension(page: any, timeoutMs: number): Promise<void> {
  try {
    await page.waitForSelector(MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR, { state: "visible", timeoutMs: Math.min(timeoutMs, 15000) });
    await page.click({ selector: MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR }, { timeoutMs: 8000 });
    try {
      await page.waitForSelector(MUSIC_TOOLS_CREATE_ITEM_SELECTOR, { state: "visible", timeoutMs: 2500 });
    } catch {
      await page.waitForSelector(MUSIC_MORE_TOOLS_SUBMENU_SELECTOR, { state: "visible", timeoutMs: 5000 });
      await page.click({ selector: MUSIC_MORE_TOOLS_SUBMENU_SELECTOR }, { timeoutMs: 5000 });
    }
    await page.waitForSelector(MUSIC_TOOLS_CREATE_ITEM_SELECTOR, { state: "visible", timeoutMs: 8000 });
    await page.click({ selector: MUSIC_TOOLS_CREATE_ITEM_SELECTOR }, { timeoutMs: 8000 });
    await page.waitForSelector(MUSIC_DESELECT_SELECTOR, { state: "visible", timeoutMs: 15000 });
  } catch (error: any) {
    const message = error?.message || String(error);
    throw Object.assign(new Error(`${ConsumerErrorCodes.ELEMENT_NOT_FOUND}: Gemini Music tool did not activate through the extension-assisted backend (${message})`), {
      errorCode: ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      evidence: { selector: `${MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR} -> ${MUSIC_TOOLS_CREATE_ITEM_SELECTOR} -> ${MUSIC_DESELECT_SELECTOR}` }
    });
  }
}

async function fillMusicComposerWithExtension(page: any, prompt: string, timeoutMs: number): Promise<void> {
  try {
    await page.fill({ selector: MUSIC_COMPOSER_SELECTOR }, prompt, { timeoutMs });
    return;
  } catch (error: any) {
    const message = error?.message || String(error);
    if (!/contenteditable|not a fillable element|must be INPUT|TEXTAREA|SELECT/i.test(message) || typeof page.javascript !== "function") {
      throw error;
    }
  }
  if (typeof page.javascript === "function") {
    await page.javascript(`
const selector = ${JSON.stringify(MUSIC_COMPOSER_SELECTOR)};
const value = ${JSON.stringify(prompt)};
const el = document.querySelector(selector);
if (!el) throw new Error("Gemini Music composer not found: " + selector);
el.focus();
const selection = window.getSelection && window.getSelection();
if (selection) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
let inserted = false;
try {
  inserted = document.execCommand && document.execCommand("insertText", false, value);
} catch (_) {
  inserted = false;
}
if (!inserted) el.textContent = value;
el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
el.dispatchEvent(new Event("change", { bubbles: true }));
return { filled: true, textLength: (el.textContent || "").length };
`, timeoutMs);
    return;
  }
}

async function generateGeminiMusicWithExtensionBackend(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  assertPromptAllowed(String(effective.prompt || ""));
  if (!effective.confirmed) return guardResponse("gemini_music_generate");
  const lease = acquireProfileLease(effective.profile);
  let backend: any;
  try {
    backend = getBackend("extension-assisted-cdp", {
      transport: "http",
      httpBridgeUrl: extensionHttpBridgeUrlForMusicArgs(effective)
    });
    await backend.ping();
    const page = await extensionGeminiMusicPage(effective, backend);
    const snapshot = await page.textSnapshot();
    if (/accounts\.google\.com|signin/i.test(String(snapshot.url || ""))) {
      return musicErrorOutput(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before music generation");
    }

    await activateMusicToolWithExtension(page, Number(effective.timeout_ms || 180000));
    await page.waitForSelector(MUSIC_COMPOSER_SELECTOR, { state: "visible", timeoutMs: Math.min(Number(effective.timeout_ms || 180000), 15000) });
    await fillMusicComposerWithExtension(page, String(effective.prompt), Math.min(Number(effective.timeout_ms || 180000), 15000));
    await page.waitForSelector(MUSIC_SEND_SELECTOR, { state: "visible", timeoutMs: 5000 });
    await page.queryElements(MUSIC_SEND_SELECTOR, { limit: 3 });
    await page.click({ selector: MUSIC_SEND_SELECTOR }, { timeoutMs: 5000 });
    await page.waitForSelector(MUSIC_DOWNLOAD_BTN_SELECTOR, { state: "visible", timeoutMs: Number(effective.timeout_ms || 180000) });
    const trackCandidates = await page.queryElements(MUSIC_DOWNLOAD_BTN_SELECTOR, { limit: 5 });
    if (!trackCandidates.length) {
      return musicErrorOutput(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini Music track did not render before timeout", { expected_selector: MUSIC_DOWNLOAD_BTN_SELECTOR });
    }

    const postMusicSnapshot = await page.textSnapshot();
    await page.assetsList();
    const bundle = await page.assetsBundle();
    const generatedAsset = bundle.assets.find((asset: any) => /\\.(mp3|wav|m4a|mp4|webm|mov|m4v)(?:[?#]|$)/i.test(asset.url));
    const conversationUrl = postMusicSnapshot.url || snapshot.url || GEMINI_MUSIC_URL;
    const downloadDir = musicDownloadDir(effective);
    const result = await ((runtime as any).artifactClick || runArtifactClick)({
      profile: effective.profile,
      tabUrlContains: effective.tab_url_contains || conversationUrl || GEMINI_MUSIC_URL,
      buttonSelector: MUSIC_DOWNLOAD_BTN_SELECTOR,
      followUpTextRegex: "MP3",
      downloadDir,
      filenamePattern: "\\.mp3$",
      timeoutMs: 60000,
      locateTimeoutMs: 20000,
      prerenderWaitMs: 1500,
      noDisconnect: true,
      pageReadyEvidence: {
        backend: "extension-assisted-cdp",
        capturedAt: bundle.capturedAt,
        assetCount: bundle.assets.length,
        generatedAssetUrl: generatedAsset?.url || null,
        trackCandidateCount: trackCandidates.length
      }
    });
    const artifactPath = result.path || result.savedPath || "";
    const stat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : undefined;
    return {
      task_id: `gemini_music_${Date.now()}`,
      status: "complete",
      conversation_url: conversationUrl,
      path: artifactPath,
      sha256: result.sha256 || "",
      size_bytes: result.size_bytes ?? result.sizeBytes ?? result.size ?? stat?.size ?? 0,
      download_filename: result.downloadFilename || (artifactPath ? path.basename(artifactPath) : ""),
      errorCode: null
    };
  } catch (error: any) {
    const code = extensionErrorCode(error);
    return musicErrorOutput(code, error?.message || code, error?.evidence ? { evidence: error.evidence } : {});
  } finally {
    await backend?.finalize?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}
async function visible(page: any, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector).first?.() || page.locator(selector);
    if (typeof loc.count === "function" && await loc.count() < 1) return false;
    if (typeof loc.isVisible === "function") return Boolean(await loc.isVisible());
    return true;
  } catch { return false; }
}

async function candidateGeminiMusicPages(page: any): Promise<any[]> {
  const pages = typeof page.context === "function" ? (page.context()?.pages?.() || []) : [];
  const seen = new Set<any>();
  return [page, ...pages].filter((candidate) => {
    if (!candidate || seen.has(candidate)) return false;
    seen.add(candidate);
    const url = String(candidate.url?.() || "");
    return /gemini\.google\.com\/app/i.test(url);
  });
}

async function findGeminiMusicStatePage(page: any): Promise<any> {
  const pages = await candidateGeminiMusicPages(page);
  for (const candidate of pages) if (await visible(candidate, MUSIC_DOWNLOAD_BTN_SELECTOR)) return candidate;
  for (const candidate of pages) if (await visible(candidate, MUSIC_STOP_SELECTOR)) return candidate;
  return page;
}

export async function webAiGeminiMusicGenerate(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  const backend = effective.backend || "extension-assisted-cdp";
  if (backend === "extension-assisted-cdp") return generateGeminiMusicWithExtensionBackend(effective, runtime);
  if (backend !== "managed-cdp") return musicErrorOutput(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_music_generate backend must be "managed-cdp" or "extension-assisted-cdp", got ${String(backend)}`);
  if (!effective.confirmed) return guardResponse("gemini_music_generate");
  return withManagedPage(effective, runtime, targetUrlForTab(effective.tab_url_contains as string | undefined), async (page) => {
    if (!effective.tab_url_contains && /\/app\/[^/?#]+/.test(page.url?.() || "")) {
      await page.goto?.(GEMINI_MUSIC_URL, { waitUntil: "domcontentloaded", timeout: Math.min(Number(effective.timeout_ms || 30000), 30000) });
    }
    await page.waitForSelector?.(`${MUSIC_COMPOSER_SELECTOR}, ${MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR}`, { state: "visible", timeout: Math.min(Number(effective.timeout_ms || 15000), 15000) }).catch(() => undefined);
    await stepActivateMusicTool(page);
    const sent = await stepGenerateTrack(page, { prompt: String(effective.prompt), confirmed: true, timeoutMs: Number(effective.timeout_ms || 180000) });
    if ((sent as any).errorCode) return sent;
    const conversation_url = page.url?.() || effective.tab_url_contains || GEMINI_MUSIC_URL;
    return { task_id: `gemini_music_${Date.now()}`, status: "generating", conversation_url };
  });
}

export async function webAiGeminiMusicDownloadTrack(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  return withManagedPage(effective, runtime, targetUrlForTab(effective.tab_url_contains as string | undefined), async (page) => {
    const musicPage = await findGeminiMusicStatePage(page);
    const requestedTab = String(effective.tab_url_contains || "");
    const tabUrlContains = requestedTab && !/^https?:\/\/gemini\.google\.com\/app\/?$/i.test(requestedTab) && requestedTab !== "gemini.google.com/app"
      ? requestedTab
      : String(musicPage.url?.() || requestedTab);
    return stepDownloadTrack(musicPage, {
    profile: effective.profile,
    tabUrlContains,
    downloadDir: effective.download_dir as string | undefined,
    format: (effective.format as GeminiMusicFormat | undefined) || "mp3",
    artifactClick: (runtime as any).artifactClick
    });
  });
}

export async function webAiGeminiMusicTaskStatus(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  return withManagedPage(effective, runtime, targetUrlForTab(effective.tab_url_contains as string | undefined), async (page) => {
    const musicPage = await findGeminiMusicStatePage(page);
    const downloadReady = await visible(musicPage, MUSIC_DOWNLOAD_BTN_SELECTOR);
    const generating = await visible(musicPage, MUSIC_STOP_SELECTOR);
    const conversation_url = musicPage.url?.() || effective.tab_url_contains || GEMINI_MUSIC_URL;
    if (downloadReady) return { status: "complete", download_ready: true, conversation_url };
    if (generating) return { status: "generating", download_ready: false, conversation_url };
    return { status: "error", download_ready: false, conversation_url };
  });
}

export const geminiMusicToolSpecs: ToolSpec[] = [
  {
    name: "webai_gemini_music_generate",
    description: "Activate Gemini Music / Lyria, send a confirmed instrumental prompt, and return an async browser-state task handle.",
    schema: generateInput,
    handler: async (args, runtime) => webAiGeminiMusicGenerate(args, runtime)
  },
  {
    name: "webai_gemini_music_download_track",
    description: "Download a Gemini Music track via the required two-stage CDP artifact-click menu (MP3 or video).",
    schema: downloadInput,
    handler: async (args, runtime) => webAiGeminiMusicDownloadTrack(args, runtime)
  },
  {
    name: "webai_gemini_music_task_status",
    description: "Inspect Gemini Music browser state for download-ready vs still-generating status.",
    schema: taskStatusInput,
    handler: async (args, runtime) => webAiGeminiMusicTaskStatus(args, runtime)
  }
];
