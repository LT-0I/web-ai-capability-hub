const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import { assertPromptAllowed, PromptPolicyDeniedError } from "../safety/promptDeny";
import { assertNotPublishDeniedLabel } from "../safety/publishDeny";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";
import { decodeGeminiStream } from "./gemini_send_prompt_rpc";
import {
  buildGeminiStreamGenerateRequest,
  errorMessageFromUnknown,
  GeminiRpcCdpSnapshot,
  GeminiRpcPayloadTemplate,
  loadGeminiRpcPayloadTemplate,
  normalizeGeminiFReqInner,
  targetUrlForGeminiRpc
} from "./gemini_upload_rpc";

function createDefaultManagedBrowserLauncher(): ManagedBrowserLauncherLike {
  return require("../runtime/pool/profilePool").createManagedBrowserLauncher();
}

interface ManagedBrowserLauncherLike {
  launch(options?: { profile?: string; url?: string; cdpPort?: number }): Promise<{ connected: boolean; cdpEndpoint: string; lastError?: string }>;
}

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CDP_PORT = 9225;
const GEMINI_CHAT_URL = "https://gemini.google.com/app";
const GEMINI_HOST = "gemini.google.com";
const DEFAULT_RESPONSE_TIMEOUT_MS = 180000;
const CAPTURE_VARIANTS = {
  image: "webai_gemini_generate_image--basic",
  video: "webai_gemini_generate_video--duration_2s",
  music: "webai_gemini_music_generate--instrumental"
} as const;

type GeminiMediaKind = "image" | "video" | "music";

export interface GeminiMediaRpcRequest {
  kind: "stream-generate" | "media-download";
  mediaKind?: GeminiMediaKind;
  url: string;
  method: "GET" | "POST";
  profile: string;
  timeoutMs: number;
  headers: Record<string, string>;
  cookies?: any[];
  body?: string;
}

export interface GeminiMediaRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  base64?: string;
  headers?: Record<string, string>;
  url?: string;
  elapsedMs?: number;
}

export type GeminiMediaRpcFetch = (request: GeminiMediaRpcRequest) => Promise<GeminiMediaRpcFetchResult>;

class GeminiMediaRpcToolError extends Error {
  errorCode: ConsumerErrorCode;
  evidence?: Record<string, unknown>;
  constructor(errorCode: ConsumerErrorCode, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

function nowMs(args: any): number {
  return typeof args?.__now === "function" ? Number(args.__now()) : Date.now();
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? args?.timeout_ms ?? args?.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function requireAbsoluteDir(downloadDir: string): void {
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must be an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
}

function sha256Buffer(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeFileName(name: string, extension: string): string {
  const cleaned = path.basename(String(name || "")).replace(/[^a-zA-Z0-9._ -]+/g, "_").trim();
  const fallback = `gemini-media-${Date.now()}.${extension}`;
  const withExt = cleaned || fallback;
  return withExt.toLowerCase().endsWith(`.${extension}`) ? withExt : `${withExt}.${extension}`;
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function contentDispositionFileName(headers?: Record<string, string>): string | undefined {
  const value = headerValue(headers, "content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (star) {
    try { return decodeURIComponent(star); } catch { return star; }
  }
  const quoted = /filename="([^"]+)"/i.exec(value)?.[1] || /filename=([^;]+)/i.exec(value)?.[1];
  return quoted ? quoted.trim() : undefined;
}

function mediaExtensionFromUrl(url: string, contentType?: string | null, kind?: GeminiMediaKind): string {
  const fromUrl = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  if (fromUrl && /^(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov|m4v|mp3|wav|m4a|aac)$/i.test(fromUrl)) return fromUrl === "jpeg" ? "jpg" : fromUrl;
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("m4a")) return "m4a";
  return kind === "image" ? "png" : kind === "music" ? "mp3" : "mp4";
}

function imageErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    dimensions: null,
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function videoErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function musicErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ task_id: "", status: "error", conversation_url: "", ok: false, errorCode, error_code: errorCode, message, ...extra });
}

function musicDownloadErrorOutput(format: string, errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, savedPath: "", sha256: "", byteSize: 0, format, errorCode, error_code: errorCode, message, ...extra });
}

function guardMusicGenerate(): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, action: "gemini_music_generate", message: "Gemini music generation sends user content and requires confirmed: true." });
}

function geminiMediaRpcErrorCode(error: any): ConsumerErrorCode {
  if (error instanceof PromptPolicyDeniedError) return ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|quota|overage|lockout|veo quota/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/artifact|download.*url|media url|no .*url/i.test(message)) return ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function httpErrorCode(status: number, body = ""): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage|lockout/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
}

async function fetchJson<T = any>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${url}`);
  return await response.json() as T;
}

function endpointOrigin(endpoint: string): string {
  const parsed = new URL(endpoint);
  return `${parsed.protocol}//${parsed.host}`;
}

function pageLooksLogin(url: string): boolean {
  return /accounts\.google\.com|signin/i.test(url || "");
}

async function ensureGeminiPage(endpoint: string, args: any): Promise<any> {
  const listUrl = `${endpointOrigin(endpoint)}/json/list`;
  let pages = await fetchJson<any[]>(listUrl);
  let page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
  if (page) return page;
  await fetch(`${endpointOrigin(endpoint)}/json/new?${encodeURIComponent(targetUrlForGeminiRpc(args))}`, { method: "PUT" }).catch(() => undefined);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    pages = await fetchJson<any[]>(listUrl).catch(() => []);
    page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new GeminiMediaRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "No Gemini CDP page was available for RPC token capture");
}

async function openFreshGeminiMediaPage(endpoint: string): Promise<any> {
  const origin = endpointOrigin(endpoint);
  const created = await fetch(`${origin}/json/new?${encodeURIComponent(`${GEMINI_CHAT_URL}?hl=en`)}`, { method: "PUT" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);
  if (created?.webSocketDebuggerUrl) return created;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const pages = await fetchJson<any[]>(`${origin}/json/list`).catch(() => []);
    const page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
    if (page?.webSocketDebuggerUrl) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new GeminiMediaRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "No fresh Gemini media page was available for RPC prelude");
}

async function cdpBatch(wsUrl: string, commands: Array<{ method: string; params?: Record<string, unknown> }>): Promise<any[]> {
  const ws = new WebSocket(wsUrl);
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  let nextId = 0;
  ws.addEventListener("message", (event: MessageEvent) => {
    try {
      const msg = JSON.parse(String(event.data));
      if (!msg.id || !pending.has(msg.id)) return;
      const entry = pending.get(msg.id)!;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(`CDP command failed: ${JSON.stringify(msg.error)}`));
      else entry.resolve(msg.result);
    } catch { /* ignore unrelated CDP events */ }
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error(`CDP websocket error for ${wsUrl}`)), { once: true });
  });
  try {
    return await Promise.all(commands.map((command) => {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method: command.method, params: command.params || {} }));
      return new Promise<any>((resolve, reject) => {
        const commandTimeout = Math.max(5000, Number(command.params?.timeout || 0) + 1000);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${command.method} timed out`));
        }, commandTimeout);
        pending.set(id, { resolve, reject, timer });
      });
    }));
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    ws.close();
  }
}

async function cdpEvaluateValue(wsUrl: string, expression: string, timeoutMs = 15000): Promise<any> {
  const [result] = await cdpBatch(wsUrl, [
    {
      method: "Runtime.evaluate",
      params: {
        expression,
        returnByValue: true,
        awaitPromise: true,
        timeout: timeoutMs
      }
    }
  ]);
  if (result?.exceptionDetails) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.UNKNOWN, `Gemini media CDP prelude failed: ${JSON.stringify(result.exceptionDetails).slice(0, 300)}`);
  return result?.result?.value;
}

function mediaPreludeSpec(mediaKind: GeminiMediaKind): { label: string; activeLabel: string; timeoutMs: number } {
  if (mediaKind === "image") return { label: "Create image", activeLabel: "Deselect Images", timeoutMs: 20000 };
  if (mediaKind === "video") return { label: "Create video", activeLabel: "Deselect Videos", timeoutMs: 25000 };
  return { label: "Create music", activeLabel: "Deselect Music", timeoutMs: 25000 };
}

async function activateGeminiMediaModeWithCdp(wsUrl: string, mediaKind: GeminiMediaKind): Promise<void> {
  await waitForGeminiCdpDocument(wsUrl);
  const spec = mediaPreludeSpec(mediaKind);
  const result = await cdpEvaluateValue(wsUrl, `((async () => {
    const label = ${JSON.stringify(spec.label)};
    const activeLabel = ${JSON.stringify(spec.activeLabel)};
    const deadline = Date.now() + ${spec.timeoutMs};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const text = (el) => String(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || "").trim();
    const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(visible);
    const click = (el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      el.click();
    };
    while (Date.now() < deadline) {
      if (firstVisible('button[aria-label="' + activeLabel.replace(/"/g, "\\\\\\"") + '"]')) return { ok: true, step: "already-active" };
      const zero = [...document.querySelectorAll("button")].find((el) => visible(el) && new RegExp(label, "i").test(el.getAttribute("aria-label") || ""));
      if (zero) {
        click(zero);
        await sleep(800);
        if (firstVisible('button[aria-label="' + activeLabel.replace(/"/g, "\\\\\\"") + '"]')) return { ok: true, step: "zero-state" };
      }
      const opener = firstVisible('button[aria-label="Upload & tools"]');
      if (opener) {
        click(opener);
        await sleep(800);
        let item = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')]
          .find((el) => visible(el) && text(el).includes(label));
        if (!item) {
          const more = [...document.querySelectorAll("button, [role='menuitem']")]
            .find((el) => visible(el) && /More tools/i.test(text(el) || el.getAttribute("aria-label") || ""));
          if (more) {
            click(more);
            await sleep(800);
            item = [...document.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], button')]
              .find((el) => visible(el) && text(el).includes(label));
          }
        }
        if (item) {
          click(item);
          await sleep(1200);
          if (firstVisible('button[aria-label="' + activeLabel.replace(/"/g, "\\\\\\"") + '"]')) return { ok: true, step: "tools-menu" };
        }
      }
      await sleep(500);
    }
    return { ok: false, text: String(document.body?.innerText || "").slice(0, 1000) };
  })())`, spec.timeoutMs + 5000);
  if (!result?.ok) {
    const body = String(result?.text || "");
    if (mediaKind === "video" && /video generation limit|quota|limit reached/i.test(body)) {
      throw new GeminiMediaRpcToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "Gemini Veo video-generation quota exhausted", { prelude_text: body.slice(0, 300) });
    }
    throw new GeminiMediaRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `Gemini ${spec.label} tool did not activate before RPC prelude`, { prelude_text: body.slice(0, 300) });
  }
}

async function waitForGeminiCdpDocument(wsUrl: string): Promise<void> {
  const deadline = Date.now() + 15000;
  let lastError: any = null;
  while (Date.now() < deadline) {
    try {
      const state = await cdpEvaluateValue(wsUrl, `(() => ({ readyState: document.readyState, href: location.href, body: Boolean(document.body) }))()`, 3000);
      if (state?.body && /gemini\.google\.com\/app/i.test(String(state.href || ""))) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new GeminiMediaRpcToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini media page did not hydrate before RPC prelude", { cause: errorMessageFromUnknown(lastError, "") });
}

function cookieDomainMatches(host: string, domain: string): boolean {
  const normalized = String(domain || "").replace(/^\./, "").toLowerCase();
  const target = host.toLowerCase();
  return target === normalized || target.endsWith(`.${normalized}`);
}

function cookieHeaderForHost(cookies: any[], host: string): string {
  return (cookies || [])
    .filter((cookie) => cookie?.name && cookieDomainMatches(host, String(cookie.domain || host)))
    .map((cookie) => `${cookie.name}=${cookie.value || ""}`)
    .join("; ");
}

async function captureGeminiMediaSnapshot(args: any, runtime?: BrowserToolRuntime): Promise<GeminiRpcCdpSnapshot> {
  if (args?.__cdpSnapshot) return args.__cdpSnapshot as GeminiRpcCdpSnapshot;
  const profile = args?.profile || GEMINI_PROFILE;
  const launcher: ManagedBrowserLauncherLike = runtime?.launcher || createDefaultManagedBrowserLauncher();
  const status = await launcher.launch({ profile, url: targetUrlForGeminiRpc(args), cdpPort: args?.cdpPort || GEMINI_CDP_PORT });
  if (!status.connected) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, status.lastError || `CDP endpoint is not connected for profile ${profile}`);
  const page = args?.__mediaKind ? await openFreshGeminiMediaPage(status.cdpEndpoint) : await ensureGeminiPage(status.cdpEndpoint, args);
  const wsUrl = page.webSocketDebuggerUrl;
  if (!wsUrl) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "Gemini CDP page did not expose a websocket debugger URL");
  if (args?.__mediaKind) await activateGeminiMediaModeWithCdp(wsUrl, args.__mediaKind as GeminiMediaKind);
  const [evalResult, cookieResult] = await cdpBatch(wsUrl, [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => { const html = String(document.documentElement?.innerHTML || ""); return { at: window.WIZ_global_data?.SNlM0e || html.match(/AOOh0P[^\\"&<\\s]+/)?.[0] || "", bl: window.WIZ_global_data?.cfb2h || html.match(/boq_assistant-bard-web-server_[^\\"'&<\\\\]+/)?.[0] || "", fsid: String(window.WIZ_global_data?.FdrFJe || ""), href: location.href, ua: navigator.userAgent }; })()`,
        returnByValue: true,
        awaitPromise: true
      }
    },
    { method: "Network.getAllCookies" }
  ]);
  const value = evalResult?.result?.value || {};
  const pageUrl = String(value.href || page.url || GEMINI_CHAT_URL);
  if (pageLooksLogin(pageUrl)) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC media generation");
  const at = String(value.at || "");
  const bl = String(value.bl || "");
  const fsid = String(value.fsid || "");
  if (!at || !bl || !fsid) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC token capture did not find at/bl/f.sid on the logged-in page");
  const cookieHeader = cookieHeaderForHost(cookieResult?.cookies || [], GEMINI_HOST);
  if (!cookieHeader) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC cookie jar was empty");
  return { at, bl, fsid, cookieHeader, cookies: cookieResult?.cookies || [], userAgent: String(value.ua || "Mozilla/5.0"), pageUrl };
}

export function buildGeminiMediaFReq(prompt: string, template: GeminiRpcPayloadTemplate): string {
  const inner = normalizeGeminiFReqInner(template);
  if (!Array.isArray(inner[0])) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini media RPC f.req prompt slot is missing");
  (inner[0] as unknown[])[0] = prompt;
  if (typeof inner[4] === "string") inner[4] = crypto.randomBytes(16).toString("hex");
  if (typeof inner[59] === "string") inner[59] = crypto.randomUUID().toUpperCase();
  return JSON.stringify([null, JSON.stringify(inner)]);
}

export function buildGeminiMediaStreamRequest(args: any, snapshot: GeminiRpcCdpSnapshot, mediaKind: GeminiMediaKind): GeminiMediaRpcRequest {
  const template = loadGeminiRpcPayloadTemplate(args, CAPTURE_VARIANTS[mediaKind]);
  const prompt = String(args?.prompt || "");
  if (!prompt.trim()) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini media RPC requires prompt");
  const request = buildGeminiStreamGenerateRequest({ ...args, prompt, __payloadTemplate: template }, snapshot, template);
  return { ...request, kind: "stream-generate", mediaKind, headers: { ...request.headers, ...capturedMediaHeaders(template) } };
}

function capturedMediaHeaders(template: GeminiRpcPayloadTemplate): Record<string, string> {
  const headers = template.headers_template || {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    const value = String(rawValue || "");
    if (!value || /\[REDACTED/i.test(value)) continue;
    if (/^x-goog-ext-\d+-jspb$/.test(key) || key === "x-browser-channel" || key === "x-browser-validation" || key === "x-browser-year") {
      out[key] = value;
    }
  }
  return out;
}

function tryParseNestedJson(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return undefined;
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    const parsed = tryParseNestedJson(value);
    if (parsed !== undefined) collectStrings(parsed, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, out);
}

function parseGeminiPayloadLines(streamText: string): unknown[] {
  const chunks: unknown[] = [];
  for (const line of String(streamText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    try { chunks.push(JSON.parse(trimmed)); }
    catch (error) { throw new GeminiMediaRpcToolError(ConsumerErrorCodes.INVALID_JSON, `Gemini RPC response chunk was not valid JSON: ${errorMessageFromUnknown(error)}`); }
  }
  if (!chunks.length) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini RPC response did not contain length-prefixed JSON chunks");
  return chunks;
}

function normalizedUrl(value: string): string | null {
  let url = String(value || "").trim().replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return null;
  try { return new URL(url).toString(); } catch { return null; }
}

export function extractGeminiMediaUrls(streamText: string): string[] {
  const strings: string[] = [];
  for (const chunk of parseGeminiPayloadLines(streamText)) collectStrings(chunk, strings);
  const urls = new Set<string>();
  for (const text of strings) {
    const literal = normalizedUrl(text);
    if (literal) urls.add(literal);
    for (const match of text.matchAll(/(?:https?:)?\/\/[^\s"'<>\\]+/g)) {
      const normalized = normalizedUrl(match[0]);
      if (normalized) urls.add(normalized);
    }
  }
  return [...urls].filter((url) => !/fonts\.gstatic\.com|www\.gstatic\.com\/images\/branding|\/productlogos\/gemini|maps\/vt\/data|google\.com\/maps/i.test(url));
}

function chooseMediaUrl(urls: string[], mediaKind: GeminiMediaKind): string | null {
  const imageRe = /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)|=image|image\//i;
  const videoRe = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)|video\//i;
  const audioRe = /\.(?:mp3|wav|m4a|aac)(?:[?#]|$)|audio\//i;
  const googleMediaRe = /googleusercontent\.com|generativelanguage|usercontent|download/i;
  if (mediaKind === "image") return urls.find((url) => imageRe.test(url)) || urls.find((url) => googleMediaRe.test(url) && !videoRe.test(url) && !audioRe.test(url)) || null;
  if (mediaKind === "video") return urls.find((url) => videoRe.test(url)) || urls.find((url) => googleMediaRe.test(url) && !imageRe.test(url) && !audioRe.test(url)) || null;
  return urls.find((url) => audioRe.test(url)) || urls.find((url) => /\.mp4(?:[?#]|$)|video\//i.test(url)) || urls.find((url) => googleMediaRe.test(url)) || null;
}

function candidateMediaUrls(urls: string[], mediaKind: GeminiMediaKind): string[] {
  const first = chooseMediaUrl(urls, mediaKind);
  return [...new Set([first, ...urls].filter(Boolean) as string[])];
}

function conversationUrlFromStream(streamText: string, snapshot: GeminiRpcCdpSnapshot): string {
  const match = /c_[a-f0-9]{8,}/i.exec(streamText);
  if (match) return `https://gemini.google.com/app/${match[0]}`;
  return snapshot.pageUrl || GEMINI_CHAT_URL;
}

async function runMediaRequest(fetchRpc: GeminiMediaRpcFetch, request: GeminiMediaRpcRequest): Promise<GeminiMediaRpcFetchResult> {
  const response = await fetchRpc(request);
  if (response.status < 200 || response.status >= 300) {
    throw new GeminiMediaRpcToolError(httpErrorCode(response.status, response.text), `${request.kind} returned HTTP ${response.status}`);
  }
  return response;
}

async function defaultGeminiMediaFetch(request: GeminiMediaRpcRequest): Promise<GeminiMediaRpcFetchResult> {
  let url = request.url;
  let response: Response;
  for (let redirectCount = 0; ; redirectCount++) {
    const headers = { ...request.headers };
    if (request.kind === "media-download") {
      const hostCookie = cookieHeaderForHost(request.cookies || [], new URL(url).hostname);
      if (hostCookie) headers.cookie = hostCookie;
    }
    response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: request.kind === "media-download" ? "manual" : "follow",
      signal: AbortSignal.timeout(Math.min(request.timeoutMs || DEFAULT_RESPONSE_TIMEOUT_MS, 300000))
    });
    if (request.kind !== "media-download" || response.status < 300 || response.status >= 400 || redirectCount >= 5) break;
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url).toString();
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  if (request.kind === "media-download") {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), text: response.ok ? "" : bytes.toString("utf8"), base64: bytes.toString("base64"), headers, url: response.url || url };
  }
  return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), text: await response.text(), headers, url: response.url || url };
}

async function downloadMediaUrl(url: string, args: any, snapshot: GeminiRpcCdpSnapshot, mediaKind: GeminiMediaKind, fetchRpc: GeminiMediaRpcFetch): Promise<{ path: string; sha256: string; size_bytes: number; download_filename: string; content_type: string | null }> {
  const downloadDir = String(args.download_dir || "");
  requireAbsoluteDir(downloadDir);
  const request: GeminiMediaRpcRequest = {
    kind: "media-download",
    mediaKind,
    url,
    method: "GET",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: responseTimeoutMs(args),
    headers: {
      accept: "*/*",
      referer: snapshot.pageUrl || "https://gemini.google.com/",
      "user-agent": snapshot.userAgent,
      cookie: cookieHeaderForHost(snapshot.cookies || [], new URL(url).hostname) || snapshot.cookieHeader
    },
    cookies: snapshot.cookies || []
  };
  const response = await runMediaRequest(fetchRpc, request);
  const bytes = Buffer.from(response.base64 || Buffer.from(response.text || "", "utf8").toString("base64"), "base64");
  if (!bytes.length) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Gemini media download returned an empty body", { url });
  if (!mediaBytesMatchKind(bytes, response.contentType, mediaKind)) {
    throw new GeminiMediaRpcToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, `Gemini media download was not a ${mediaKind} artifact`, { url, content_type: response.contentType || null, byte_count: bytes.length });
  }
  const extension = mediaExtensionFromUrl(url, response.contentType, mediaKind);
  const suggested = contentDispositionFileName(response.headers) || path.basename(new URL(url).pathname) || `gemini-${mediaKind}.${extension}`;
  const filePath = path.join(downloadDir, safeFileName(suggested, extension));
  fs.writeFileSync(filePath, bytes);
  return { path: filePath, sha256: sha256Buffer(bytes), size_bytes: bytes.length, download_filename: path.basename(filePath), content_type: response.contentType || null };
}

function mediaBytesMatchKind(bytes: Buffer, contentType: string | null | undefined, mediaKind: GeminiMediaKind): boolean {
  const ct = String(contentType || "").toLowerCase();
  const headBytes = bytes.subarray(0, 16);
  const head = Array.from(headBytes).map((value) => String.fromCharCode(value)).join("");
  const hasPrefix = (prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  const asciiAt = (start: number, value: string) => Array.from(bytes.subarray(start, start + value.length)).map((byte) => String.fromCharCode(byte)).join("") === value;
  if (mediaKind === "image") {
    return ct.startsWith("image/") && !ct.includes("svg")
      || hasPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      || hasPrefix([0xff, 0xd8, 0xff])
      || head.startsWith("GIF8")
      || head.startsWith("RIFF") && asciiAt(8, "WEBP");
  }
  if (mediaKind === "video") {
    return ct.startsWith("video/")
      || head.includes("ftyp")
      || hasPrefix([0x1a, 0x45, 0xdf, 0xa3]);
  }
  return ct.startsWith("audio/")
    || head.startsWith("ID3")
    || hasPrefix([0xff, 0xfb])
    || head.startsWith("RIFF") && asciiAt(8, "WAVE")
    || head.includes("ftyp");
}

async function submitMediaAndDownload(args: any, mediaKind: GeminiMediaKind, fetchRpc: GeminiMediaRpcFetch): Promise<Record<string, unknown>> {
  const snapshot = args.__cdpSnapshot as GeminiRpcCdpSnapshot;
  if (!snapshot) throw new GeminiMediaRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini media RPC test path requires args.__cdpSnapshot");
  const request = buildGeminiMediaStreamRequest(args, snapshot, mediaKind);
  const stream = await runMediaRequest(fetchRpc, request);
  const decoded = decodeGeminiStream(stream.text);
  const conversation_url = conversationUrlFromStream(stream.text, snapshot);
  const urls = extractGeminiMediaUrls(stream.text);
  const candidates = candidateMediaUrls(urls, mediaKind);
  if (!candidates.length) {
    const code = /quota|limit reached|too many requests|try again later/i.test(stream.text) ? ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED : ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT;
    throw new GeminiMediaRpcToolError(code, `Gemini ${mediaKind} RPC response did not include a downloadable media URL`, { conversation_url, response_text: decoded.text, url_count: urls.length });
  }
  let lastError: any = null;
  for (const mediaUrl of candidates) {
    try {
      const artifact = await downloadMediaUrl(mediaUrl, args, snapshot, mediaKind, fetchRpc);
      return { decoded, conversation_url, mediaUrl, artifact } as any;
    } catch (error: any) {
      lastError = error;
    }
  }
  throw new GeminiMediaRpcToolError(
    ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
    `Gemini ${mediaKind} RPC response media URLs were present but none downloaded successfully`,
    { conversation_url, response_text: decoded.text, url_count: urls.length, candidates: candidates.slice(0, 5), cause: errorMessageFromUnknown(lastError, "") }
  );
}

async function withCapturedSnapshot<T>(args: any, runtime: BrowserToolRuntime | undefined, fn: (effective: any) => Promise<T>): Promise<T> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  if (effective.__cdpSnapshot) return fn(effective);
  const lease = acquireProfileLease(effective.profile);
  try {
    const snapshot = await captureGeminiMediaSnapshot(effective, runtime);
    return await fn({ ...effective, __cdpSnapshot: snapshot });
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}

export async function webAiGeminiGenerateImageRpcWithFetch(args: any, fetchRpc: GeminiMediaRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  try {
    assertPromptAllowed(String(effective.prompt || ""));
    assertNotPublishDeniedLabel("Download full size image", { tool: "webai.gemini.generate_image" });
    const result: any = await submitMediaAndDownload(effective, "image", fetchRpc);
    return safeOutput({
      path: result.artifact.path,
      sha256: result.artifact.sha256,
      size_bytes: result.artifact.size_bytes,
      dimensions: null,
      download_filename: result.artifact.download_filename,
      conversation_url: result.conversation_url,
      media_url: result.mediaUrl,
      response_text: result.decoded.text,
      errorCode: null
    });
  } catch (error: any) {
    const code = geminiMediaRpcErrorCode(error);
    return imageErrorOutput(code, errorMessageFromUnknown(error, code), error?.evidence ? { evidence: error.evidence } : {});
  }
}

export async function webAiGeminiGenerateImageRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  return withCapturedSnapshot({ ...(args || {}), __mediaKind: "image" }, runtime, (effective) => webAiGeminiGenerateImageRpcWithFetch(effective, effective.__fetch || defaultGeminiMediaFetch));
}

export async function webAiGeminiGenerateVideoRpcWithFetch(args: any, fetchRpc: GeminiMediaRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  try {
    assertPromptAllowed(String(effective.prompt || ""));
    assertNotPublishDeniedLabel("Download video", { tool: "webai.gemini.generate_video" });
    const result: any = await submitMediaAndDownload(effective, "video", fetchRpc);
    return safeOutput({
      path: result.artifact.path,
      sha256: result.artifact.sha256,
      size_bytes: result.artifact.size_bytes,
      download_filename: result.artifact.download_filename,
      conversation_url: result.conversation_url,
      media_url: result.mediaUrl,
      response_text: result.decoded.text,
      errorCode: null
    });
  } catch (error: any) {
    const code = geminiMediaRpcErrorCode(error);
    return videoErrorOutput(code, errorMessageFromUnknown(error, code), error?.evidence ? { evidence: error.evidence } : {});
  }
}

export async function webAiGeminiGenerateVideoRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  return withCapturedSnapshot({ ...(args || {}), __mediaKind: "video" }, runtime, (effective) => webAiGeminiGenerateVideoRpcWithFetch(effective, effective.__fetch || defaultGeminiMediaFetch));
}

export async function webAiGeminiMusicGenerateRpcWithFetch(args: any, fetchRpc: GeminiMediaRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  try {
    assertPromptAllowed(String(effective.prompt || ""));
    if (!effective.confirmed) return guardMusicGenerate();
    const result: any = await submitMediaAndDownload(effective, "music", fetchRpc);
    return safeOutput({
      task_id: `gemini_music_rpc_${Date.now()}`,
      status: "complete",
      conversation_url: result.conversation_url,
      path: result.artifact.path,
      sha256: result.artifact.sha256,
      size_bytes: result.artifact.size_bytes,
      download_filename: result.artifact.download_filename,
      media_url: result.mediaUrl,
      response_text: result.decoded.text,
      errorCode: null
    });
  } catch (error: any) {
    const code = geminiMediaRpcErrorCode(error);
    return musicErrorOutput(code, errorMessageFromUnknown(error, code), error?.evidence ? { evidence: error.evidence } : {});
  }
}

export async function webAiGeminiMusicGenerateRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  return withCapturedSnapshot({ ...(args || {}), __mediaKind: "music" }, runtime, (effective) => webAiGeminiMusicGenerateRpcWithFetch(effective, effective.__fetch || defaultGeminiMediaFetch));
}

export async function webAiGeminiMusicDownloadTrackRpc(args: any): Promise<Record<string, unknown>> {
  const format = String(args?.format || "mp3");
  return musicDownloadErrorOutput(format, ConsumerErrorCodes.INVALID_ARGS, "RPC_NOT_AVAILABLE: Wave A/B2 found no matching Gemini Music download-track RPC for mp3/video; dispatcher keeps these variants DOM-only by write-time decision.");
}

export const generateGeminiImageRpc = webAiGeminiGenerateImageRpc;
export const generateGeminiVideoRpc = webAiGeminiGenerateVideoRpc;
export const generateGeminiMusicRpc = webAiGeminiMusicGenerateRpc;
