const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { chromium } from "playwright";

import { ConsumerErrorCodes } from "../consumer/errorCodes";
import { assertPromptAllowed } from "../safety/promptDeny";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  loginRequiredForService,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";
import { dismissGeminiOverlay, ensureGeminiToolsAvailable, toggleGeminiTool } from "./geminiExtensionHelpers";
import {
  buildGeminiCanvasRpcFReq,
  captureGeminiCanvasRpcSnapshotFromPage,
  decodeGeminiCanvasRpcStream,
  errorMessageFromUnknown,
  fetchGeminiCanvasRpcInPage,
  GeminiCanvasRpcFetch,
  GeminiCanvasRpcFetchResult,
  GeminiCanvasRpcPayloadTemplate,
  GeminiCanvasRpcRequest,
  GeminiCanvasRpcSnapshot,
  GeminiCanvasRpcToolError,
  geminiCanvasRpcErrorCode
} from "./gemini_canvas_rpc";

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CDP_PORT = 9225;
const GEMINI_FRESH_COMPOSER_URL = "https://gemini.google.com/app?hl=en";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR = 'button[aria-label="Upload & tools"]';
const GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Deep research")';

const CAPTURE_ROOTS = [
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-b4-canvas-research", "fixtures"),
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-a-captures")
];

function nowMs(args: any): number {
  return typeof args?.__now === "function" ? Number(args.__now()) : Date.now();
}

function safeTaskId(): string {
  return `gemini_research_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? args?.timeout_ms ?? args?.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function targetUrlForGemini(args: any): string {
  const value = String(args?.url || args?.tab_url_contains || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return `https://gemini.google.com/app/${value}`;
  return GEMINI_FRESH_COMPOSER_URL;
}

function effectiveGeminiArgs(args: any): any {
  return { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
}

function sensitiveContentGuard(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, message, ...extra });
}

function httpStatusErrorCode(status: number, body = "") {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage|lockout/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
}

function deepResearchErrorOutput(args: any, taskId: string, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = geminiCanvasRpcErrorCode(error);
  return safeOutput({
    ok: false,
    service: "gemini",
    task_id: taskId,
    status: "failed",
    chat_url: targetUrlForGemini(args || {}),
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

export function loadGeminiDeepResearchRpcPayloadTemplate(args: any = {}): GeminiCanvasRpcPayloadTemplate {
  if (args.__payloadTemplate) return args.__payloadTemplate as GeminiCanvasRpcPayloadTemplate;
  const operationId = "webai_gemini_deep_research--start";
  const candidates = [
    args?.__payloadTemplatePath,
    ...CAPTURE_ROOTS.map((root) => path.join(root, operationId, "payload-template.json"))
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return JSON.parse(fs.readFileSync(candidate, "utf8")); } catch { /* try next local capture */ }
  }
  throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini Deep research RPC payload template was not found for ${operationId}`);
}

function buildStreamEndpoint(template: GeminiCanvasRpcPayloadTemplate, snapshot: GeminiCanvasRpcSnapshot, args: any): string {
  const endpoint = String(template.endpoint || "");
  if (!endpoint) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini Deep research RPC payload template is missing endpoint");
  const url = new URL(endpoint);
  url.searchParams.set("bl", snapshot.bl);
  url.searchParams.set("f.sid", snapshot.fsid);
  url.searchParams.set("hl", "en");
  const reqid = Number.isFinite(Number(args?.__reqid)) ? Number(args.__reqid) : Math.floor(100000 + (Date.now() % 9000000));
  url.searchParams.set("_reqid", String(reqid));
  url.searchParams.set("rt", "c");
  return url.toString();
}

function copiedStreamHeaders(template: GeminiCanvasRpcPayloadTemplate, snapshot: GeminiCanvasRpcSnapshot): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "*/*",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: "https://gemini.google.com",
    referer: "https://gemini.google.com/",
    "x-same-domain": "1",
    "user-agent": snapshot.userAgent
  };
  const source = template.headers_template || {};
  for (const key of ["x-goog-ext-525001261-jspb", "x-goog-ext-73010989-jspb", "x-browser-channel", "x-browser-year", "x-client-data"]) {
    const value = source[key];
    if (typeof value === "string" && value && !/\[REDACTED/i.test(value)) headers[key] = value;
  }
  return headers;
}

export function buildGeminiDeepResearchRpcRequest(args: any, snapshot: GeminiCanvasRpcSnapshot, template?: GeminiCanvasRpcPayloadTemplate): GeminiCanvasRpcRequest {
  const prompt = String(args?.prompt || "").trim();
  if (!prompt) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_deep_research RPC requires prompt");
  const effectiveTemplate = template || loadGeminiDeepResearchRpcPayloadTemplate(args);
  const form = new URLSearchParams();
  form.set("f.req", buildGeminiCanvasRpcFReq(prompt, effectiveTemplate));
  form.set("at", snapshot.at);
  return {
    tool: "webai_gemini_deep_research",
    variant: "start",
    url: buildStreamEndpoint(effectiveTemplate, snapshot, args),
    method: "POST",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: responseTimeoutMs(args),
    headers: copiedStreamHeaders(effectiveTemplate, snapshot),
    body: form.toString()
  };
}

async function clickSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  try { await page.waitForSelector?.(selector, { state: "visible", timeout: timeoutMs, timeoutMs }); } catch (error: any) {
    throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: error?.message || String(error) });
  }
  if (typeof page.click === "function") {
    await page.click(selector, { timeout: timeoutMs }).catch(async (error: any) => {
      const loc = page.locator?.(selector).first?.() || page.locator?.(selector);
      if (loc && typeof loc.click === "function") return loc.click({ timeout: timeoutMs, force: true });
      throw error;
    });
    return;
  }
  const loc = page.locator?.(selector).first?.() || page.locator?.(selector);
  if (loc && typeof loc.click === "function") {
    await loc.click({ timeout: timeoutMs, force: true });
    return;
  }
  throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector });
}

export async function prepareGeminiDeepResearchRpcPage(page: any, args: any): Promise<void> {
  const target = targetUrlForGemini(args);
  const currentUrl = String(page.url?.() || "");
  if (!/gemini\.google\.com\/app/i.test(currentUrl) || args?.__forceFreshComposer) {
    await page.goto?.(target, { waitUntil: "domcontentloaded", timeout: Math.min(Number(args?.timeout_ms || 60000), 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  }
  await page.bringToFront?.().catch?.(() => undefined);
  const pageUrl = String(page.url?.() || target);
  if (loginRequiredForService("gemini", pageUrl)) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before Deep research RPC", { url: pageUrl });
  const canProbeLiveDom = typeof page?.evaluate === "function" || typeof page?.evaluateReadOnly === "function";
  if (canProbeLiveDom) {
    await dismissGeminiOverlay(page).catch(() => undefined);
    await ensureGeminiToolsAvailable(page);
    await dismissGeminiOverlay(page).catch(() => undefined);
    try {
      await toggleGeminiTool(page, "Deep research", 1, 15000);
      return;
    } catch (primaryError: any) {
      if (primaryError?.errorCode && primaryError.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND) throw primaryError;
      await dismissGeminiOverlay(page).catch(() => undefined);
      try {
        await toggleGeminiTool(page, "Deep research", 2, 15000);
        return;
      } catch (fallbackError: any) {
        if (fallbackError?.errorCode && fallbackError.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND) throw fallbackError;
        throw new GeminiCanvasRpcToolError(
          ConsumerErrorCodes.ELEMENT_NOT_FOUND,
          "Gemini Deep research menuitemcheckbox was not found",
          {
            selector: GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR,
            primary_cause: primaryError?.message || String(primaryError),
            fallback_cause: fallbackError?.message || String(fallbackError)
          }
        );
      }
    }
  }
  try {
    await clickSelector(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000, "Gemini Upload & tools button was not found");
    await clickSelector(page, GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR, 15000, "Gemini Deep research menuitemcheckbox was not found");
  } catch (primaryError: any) {
    await dismissGeminiOverlay(page).catch(() => undefined);
    try {
      await toggleGeminiTool(page, "Deep research", 1, 15000);
    } catch (fallbackError: any) {
      throw new GeminiCanvasRpcToolError(
        ConsumerErrorCodes.ELEMENT_NOT_FOUND,
        "Gemini Deep research menuitemcheckbox was not found",
        {
          selector: GEMINI_DEEP_RESEARCH_MENUITEM_SELECTOR,
          primary_cause: primaryError?.message || String(primaryError),
          fallback_cause: fallbackError?.message || String(fallbackError)
        }
      );
    }
  }
}

function chatUrlFromDecoded(decoded: { conversationId: string | null }, snapshot: GeminiCanvasRpcSnapshot, args: any): string {
  if (decoded.conversationId) return `https://gemini.google.com/app/${decoded.conversationId}`;
  return snapshot.pageUrl || targetUrlForGemini(args);
}

function persistRpcDeepResearchTask(runtime: BrowserToolRuntime | undefined, args: any, taskId: string, chatUrl: string): void {
  const database = runtime?.database;
  if (!database || typeof database.upsertWebAiTask !== "function") return;
  database.upsertWebAiTask({
    task_id: taskId,
    status: "queued",
    profile: args.profile || GEMINI_PROFILE,
    lease_id: "rpc",
    started_at: new Date().toISOString(),
    progress_label: "queued Gemini Deep research task",
    timeout_ms: args.timeout_ms || 1800000,
    result: { chat_url: chatUrl, backend: "rpc" }
  });
}

export async function webAiGeminiDeepResearchRpcWithPage(args: any, page: any, fetchRpc: GeminiCanvasRpcFetch = fetchGeminiCanvasRpcInPage, options: { taskId?: string; runtime?: BrowserToolRuntime } = {}): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs(args);
  const taskId = options.taskId || safeTaskId();
  const started = nowMs(effective);
  let httpStatus: number | null = null;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_deep_research requires a string prompt");
    assertPromptAllowed(effective.prompt);
    if (effective.confirmed !== true) return sensitiveContentGuard("Submitting Gemini Deep research requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "deep_research" });
    await prepareGeminiDeepResearchRpcPage(page, { ...effective, __forceFreshComposer: true });
    const snapshot = effective.__cdpSnapshot || await captureGeminiCanvasRpcSnapshotFromPage(page);
    const request = buildGeminiDeepResearchRpcRequest(effective, snapshot);
    const response: GeminiCanvasRpcFetchResult = await fetchRpc(page, request);
    httpStatus = response.status;
    if (response.status < 200 || response.status >= 300) throw new GeminiCanvasRpcToolError(httpStatusErrorCode(response.status, response.text || ""), `Gemini Deep research RPC returned HTTP ${response.status}`);
    const decoded = decodeGeminiCanvasRpcStream(response.text);
    if (!decoded.text.trim()) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini Deep research RPC completed without decoded plan text");
    const chatUrl = chatUrlFromDecoded(decoded, snapshot, effective);
    persistRpcDeepResearchTask(options.runtime, effective, taskId, chatUrl);
    return safeOutput({
      ok: true,
      task_id: taskId,
      status: "queued",
      chat_url: chatUrl,
      wait_ms: response.elapsedMs ?? (nowMs(effective) - started),
      elapsed_ms: nowMs(effective) - started,
      http_status: response.status,
      backend: "rpc",
      response_text: decoded.text,
      errorCode: null
    });
  } catch (error: any) {
    return deepResearchErrorOutput(effective, taskId, error, { http_status: httpStatus, elapsed_ms: nowMs(effective) - started });
  }
}

async function connectBrowserForGeminiProfile(args: any, runtime?: BrowserToolRuntime): Promise<any> {
  const profile = String(args?.profile || GEMINI_PROFILE);
  const target = targetUrlForGemini(args);
  if (runtime?.launcher && typeof (runtime.launcher as any).launch === "function" && typeof (runtime.launcher as any).connectOverCdp === "function") {
    const status = await (runtime.launcher as any).launch({ profile, url: target, cdpPort: args?.cdpPort || GEMINI_CDP_PORT });
    if (!status?.connected) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, status?.lastError || `CDP endpoint is not connected for profile ${profile}`);
    return (runtime.launcher as any).connectOverCdp(status);
  }
  const cdpPort = Number(args?.cdp_port ?? args?.cdpPort ?? (/(\d{4,5})$/.exec(profile)?.[1]) ?? GEMINI_CDP_PORT);
  const endpoint = String(args?.cdp_endpoint || args?.cdpEndpoint || `http://127.0.0.1:${cdpPort}`);
  return chromium.connectOverCDP(endpoint);
}

async function geminiOriginPage(browser: any, args: any): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, "No browser context is available from Gemini CDP connection");
  const pages = context.pages?.() || [];
  const isGemini = (url: string) => /https:\/\/gemini\.google\.com\/app/i.test(url || "");
  let page = pages.find((candidate: any) => isGemini(String(candidate.url?.() || "")));
  if (!page) page = await context.newPage();
  const target = targetUrlForGemini(args);
  const currentUrl = String(page.url?.() || "");
  if (!isGemini(currentUrl) || args?.__forceFreshComposer) {
    await page.goto?.(target, { waitUntil: "domcontentloaded", timeout: Math.min(Number(args?.timeout_ms || 60000), 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  }
  await page.bringToFront?.().catch?.(() => undefined);
  return page;
}

export async function webAiGeminiDeepResearchRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs(args);
  const taskId = safeTaskId();
  if (effective.confirmed !== true) return sensitiveContentGuard("Submitting Gemini Deep research requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "deep_research" });
  const lease = acquireProfileLease(effective.profile);
  let browser: any;
  try {
    browser = await connectBrowserForGeminiProfile(effective, runtime);
    const page = await geminiOriginPage(browser, { ...effective, __forceFreshComposer: true });
    return await webAiGeminiDeepResearchRpcWithPage(effective, page, effective.__fetch || fetchGeminiCanvasRpcInPage, { taskId, runtime });
  } catch (error: any) {
    return deepResearchErrorOutput(effective, taskId, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

export const startGeminiDeepResearchRpc = webAiGeminiDeepResearchRpc;
