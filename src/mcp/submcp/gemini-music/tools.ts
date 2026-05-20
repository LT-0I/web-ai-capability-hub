import { objectSchema, scalar } from "../../../utils/schema";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { BrowserToolRuntime, ToolSpec, withManagedPage } from "../../tools";
import {
  GEMINI_MUSIC_URL,
  MUSIC_COMPOSER_SELECTOR,
  MUSIC_DOWNLOAD_BTN_SELECTOR,
  MUSIC_STOP_SELECTOR,
  MUSIC_UPLOAD_TOOLS_TRIGGER_SELECTOR,
  GeminiMusicFormat,
  stepActivateMusicTool,
  stepDownloadTrack,
  stepGenerateTrack
} from "./flow";

const DEFAULT_MUSIC_PROFILE = "gemini-9225";

type GenerateArgs = { prompt: string; profile?: string; confirmed?: boolean; tab_url_contains?: string; timeout_ms?: number };
type DownloadArgs = { tab_url_contains: string; profile?: string; download_dir?: string; format?: GeminiMusicFormat };
type StatusArgs = { tab_url_contains: string; profile?: string };

const generateInput = objectSchema<GenerateArgs>({
  prompt: scalar.string("Benign instrumental track prompt for Gemini Music / Lyria"),
  profile: { ...scalar.string("Managed Gemini browser profile"), default: DEFAULT_MUSIC_PROFILE },
  confirmed: { ...scalar.boolean("Required true to send the music generation prompt"), default: false },
  tab_url_contains: scalar.string("Optional Gemini conversation URL fragment"),
  timeout_ms: scalar.number("Generation readiness timeout in milliseconds")
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
async function visible(page: any, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector).first?.() || page.locator(selector);
    if (typeof loc.count === "function" && await loc.count() < 1) return false;
    if (typeof loc.isVisible === "function") return Boolean(await loc.isVisible());
    return true;
  } catch { return false; }
}

export async function webAiGeminiMusicGenerate(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
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
  return withManagedPage(effective, runtime, targetUrlForTab(effective.tab_url_contains as string | undefined), async (page) => stepDownloadTrack(page, {
    profile: effective.profile,
    tabUrlContains: String(effective.tab_url_contains),
    downloadDir: effective.download_dir as string | undefined,
    format: (effective.format as GeminiMusicFormat | undefined) || "mp3",
    artifactClick: (runtime as any).artifactClick
  }));
}

export async function webAiGeminiMusicTaskStatus(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  return withManagedPage(effective, runtime, targetUrlForTab(effective.tab_url_contains as string | undefined), async (page) => {
    const downloadReady = await visible(page, MUSIC_DOWNLOAD_BTN_SELECTOR);
    const generating = await visible(page, MUSIC_STOP_SELECTOR);
    if (downloadReady) return { status: "complete", download_ready: true };
    if (generating) return { status: "generating", download_ready: false };
    return { status: "error", download_ready: false };
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
