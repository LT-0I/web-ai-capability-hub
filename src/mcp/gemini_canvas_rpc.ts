const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { chromium } from "playwright";

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import { assertPromptAllowed, PromptPolicyDeniedError } from "../safety/promptDeny";
import { assertNotPublishDeniedLabel } from "../safety/publishDeny";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  loginRequiredForService,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";
import { dismissGeminiOverlay, ensureGeminiToolsAvailable, toggleGeminiTool } from "./geminiExtensionHelpers";

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CDP_PORT = 9225;
const GEMINI_FRESH_COMPOSER_URL = "https://gemini.google.com/app?hl=en";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR = 'button[aria-label="Upload & tools"]';
const GEMINI_CANVAS_MENUITEM_SELECTOR = '[role="menuitemcheckbox"]:has-text("Canvas")';
const GEMINI_CANVAS_MODE_ACTIVE_SELECTOR = 'button[aria-label="Deselect Canvas"]';
const GEMINI_CANVAS_PROMPT_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
const GEMINI_SEND_BUTTON_SELECTOR = 'button[aria-label="Send message"]';
const GEMINI_CANVAS_SHARE_BUTTON_SELECTOR = '[data-test-id="share-button"] button, [data-testid="share-button"] button, button[data-test-id="share-button"], button[data-testid="share-button"], button[aria-label="Share and export canvas"], button[aria-label*="share" i][aria-label*="Canvas" i]';
const GEMINI_CANVAS_EXPORT_DOCS_SELECTOR = '[data-test-id="export-to-docs-button"], [data-testid="export-to-docs-button"], export-to-docs-button, gem-menu-item[data-test-id="export-to-docs-button"], button[data-test-id="export-to-docs-button"], button[data-testid="export-to-docs-button"]';
const GOOGLE_DOCS_URL_RE = /^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/;

const CAPTURE_ROOTS = [
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-b4-canvas-research", "fixtures"),
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-a-captures")
];

export type GeminiCanvasRpcVariant = "open_canvas" | "direct_edit" | "ai_length" | "ai_tone" | "export_docs" | "noop";

export interface GeminiCanvasRpcPayloadTemplate {
  operation_id?: string;
  tool?: string;
  variant?: string;
  endpoint?: string;
  rpc_id?: string;
  headers_template?: Record<string, string>;
  form_template?: Record<string, string>;
  f_req_template?: unknown[];
  placeholders?: Record<string, unknown>;
}

export interface GeminiCanvasRpcSnapshot {
  at: string;
  bl: string;
  fsid: string;
  userAgent: string;
  pageUrl: string;
}

export interface GeminiCanvasRpcRequest {
  tool: string;
  variant: GeminiCanvasRpcVariant | "start";
  url: string;
  method: "POST";
  profile: string;
  timeoutMs: number;
  headers: Record<string, string>;
  body: string;
}

export interface GeminiCanvasRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  headers?: Record<string, string>;
  url?: string;
  elapsedMs?: number;
}

export type GeminiCanvasRpcFetch = (page: any, request: GeminiCanvasRpcRequest) => Promise<GeminiCanvasRpcFetchResult>;

export interface GeminiCanvasRpcDecodedResponse {
  text: string;
  canvasHtml: string;
  conversationId: string | null;
  responseId: string | null;
  artifactUrl: string | null;
}

export class GeminiCanvasRpcToolError extends Error {
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

export function errorMessageFromUnknown(error: any, fallback = "UNKNOWN"): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function randomHex32(): string {
  return crypto.randomBytes(16).toString("hex");
}

function uuidUpper(): string {
  return crypto.randomUUID().toUpperCase();
}

export function geminiCanvasRpcErrorCode(error: any): ConsumerErrorCode {
  if (error instanceof PromptPolicyDeniedError) return ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/RPC_NOT_AVAILABLE|unsupported|invalid args/i.test(message)) return ConsumerErrorCodes.INVALID_ARGS;
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|quota|overage|lockout/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403|accounts\.google/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No Gemini CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  if (/selector|not found|did not activate/i.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  return ConsumerErrorCodes.UNKNOWN;
}

function httpStatusErrorCode(status: number, body = ""): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage|lockout/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
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

export function resolveGeminiCanvasRpcVariant(args: any = {}, tool = "webai_gemini_canvas_edit"): GeminiCanvasRpcVariant {
  const explicit = String(args?.__variant || args?.variant || "").trim().toLowerCase();
  if (explicit === "open_canvas" || explicit === "direct_edit" || explicit === "ai_length" || explicit === "ai_tone" || explicit === "export_docs") return explicit as GeminiCanvasRpcVariant;
  if (tool === "webai_gemini_canvas_to_docs" || args?.__tool === "webai_gemini_canvas_to_docs") return "export_docs";
  if (args?.edit_text) return "direct_edit";
  const aiAction = String(args?.ai_action || "").trim().toLowerCase();
  if (aiAction === "length") return "ai_length";
  if (aiAction === "tone") return "ai_tone";
  if (aiAction) return "ai_tone";
  if (args?.prompt) return "open_canvas";
  return "noop";
}

export function geminiCanvasRpcVariantAvailable(variant: GeminiCanvasRpcVariant): boolean {
  return variant === "open_canvas";
}

export function geminiCanvasRpcOperationId(variant: GeminiCanvasRpcVariant): string {
  if (variant === "export_docs") return "webai_gemini_canvas_to_docs--export_docs";
  return `webai_gemini_canvas_edit--${variant}`;
}

export function loadGeminiCanvasRpcPayloadTemplate(args: any = {}, variant: GeminiCanvasRpcVariant = "open_canvas"): GeminiCanvasRpcPayloadTemplate {
  if (args.__payloadTemplate) return args.__payloadTemplate as GeminiCanvasRpcPayloadTemplate;
  const operationId = geminiCanvasRpcOperationId(variant);
  const candidates = [
    args?.__payloadTemplatePath,
    ...CAPTURE_ROOTS.map((root) => path.join(root, operationId, "payload-template.json"))
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return JSON.parse(fs.readFileSync(candidate, "utf8")); } catch { /* try next local capture */ }
  }
  throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini Canvas RPC payload template was not found for ${operationId}`);
}

function normalizeStreamFReqInner(template: GeminiCanvasRpcPayloadTemplate): unknown[] {
  const top = template.f_req_template;
  if (!Array.isArray(top) || top.length < 2) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini Canvas RPC payload template is missing f_req_template");
  if (Array.isArray(top[1])) return cloneJson(top[1] as unknown[]);
  if (typeof top[1] === "string") {
    const parsed = JSON.parse(top[1]);
    if (Array.isArray(parsed)) return parsed;
  }
  throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini Canvas RPC f_req_template has an unsupported shape");
}

export function buildGeminiCanvasRpcFReq(prompt: string, template: GeminiCanvasRpcPayloadTemplate): string {
  const inner = normalizeStreamFReqInner(template);
  if (!Array.isArray(inner[0])) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini Canvas RPC prompt slot is missing");
  (inner[0] as unknown[])[0] = prompt;
  if (typeof inner[4] === "string") inner[4] = randomHex32();
  if (typeof inner[59] === "string") inner[59] = uuidUpper();
  return JSON.stringify([null, JSON.stringify(inner)]);
}

function buildStreamEndpoint(template: GeminiCanvasRpcPayloadTemplate, snapshot: GeminiCanvasRpcSnapshot, args: any): string {
  const endpoint = String(template.endpoint || "");
  if (!endpoint) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini Canvas RPC payload template is missing endpoint");
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

export function buildGeminiCanvasRpcRequest(args: any, snapshot: GeminiCanvasRpcSnapshot, template?: GeminiCanvasRpcPayloadTemplate, variant: GeminiCanvasRpcVariant = "open_canvas"): GeminiCanvasRpcRequest {
  const prompt = String(args?.prompt || "").trim();
  if (!prompt) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_canvas_edit RPC open_canvas requires prompt");
  const effectiveTemplate = template || loadGeminiCanvasRpcPayloadTemplate(args, variant);
  const form = new URLSearchParams();
  form.set("f.req", buildGeminiCanvasRpcFReq(prompt, effectiveTemplate));
  form.set("at", snapshot.at);
  return {
    tool: variant === "export_docs" ? "webai_gemini_canvas_to_docs" : "webai_gemini_canvas_edit",
    variant,
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

export async function prepareGeminiCanvasRpcPage(page: any, args: any): Promise<void> {
  const target = targetUrlForGemini(args);
  const currentUrl = String(page.url?.() || "");
  if (!/gemini\.google\.com\/app/i.test(currentUrl) || args?.__forceFreshComposer) {
    await page.goto?.(target, { waitUntil: "domcontentloaded", timeout: Math.min(Number(args?.timeout_ms || 60000), 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  }
  await page.bringToFront?.().catch?.(() => undefined);
  const pageUrl = String(page.url?.() || target);
  if (loginRequiredForService("gemini", pageUrl)) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before Canvas RPC", { url: pageUrl });
  const canProbeLiveDom = typeof page?.evaluate === "function" || typeof page?.evaluateReadOnly === "function";
  if (canProbeLiveDom) {
    await dismissGeminiOverlay(page).catch(() => undefined);
    await ensureGeminiToolsAvailable(page);
    await dismissGeminiOverlay(page).catch(() => undefined);
    try {
      await toggleGeminiTool(page, "Canvas", 1, 15000);
    } catch (primaryError: any) {
      if (primaryError?.errorCode && primaryError.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND) throw primaryError;
      await dismissGeminiOverlay(page).catch(() => undefined);
      try {
        await toggleGeminiTool(page, "Canvas", 2, 15000);
      } catch (fallbackError: any) {
        if (fallbackError?.errorCode && fallbackError.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND) throw fallbackError;
        throw new GeminiCanvasRpcToolError(
          ConsumerErrorCodes.ELEMENT_NOT_FOUND,
          "Gemini Canvas menuitemcheckbox was not found",
          {
            selector: GEMINI_CANVAS_MENUITEM_SELECTOR,
            primary_cause: primaryError?.message || String(primaryError),
            fallback_cause: fallbackError?.message || String(fallbackError)
          }
        );
      }
    }
    try {
      await page.waitForSelector?.(GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: 15000, timeoutMs: 15000 });
      return;
    } catch (error: any) {
      throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas mode did not expose its active pill", { selector: GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, cause: error?.message || String(error) });
    }
  }
  await clickSelector(page, GEMINI_UPLOAD_TOOLS_TRIGGER_SELECTOR, 15000, "Gemini Upload & tools button was not found");
  await clickSelector(page, GEMINI_CANVAS_MENUITEM_SELECTOR, 15000, "Gemini Canvas menuitemcheckbox was not found");
  try {
    await page.waitForSelector?.(GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, { state: "visible", timeout: 15000, timeoutMs: 15000 });
  } catch (error: any) {
    throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas mode did not expose its active pill", { selector: GEMINI_CANVAS_MODE_ACTIVE_SELECTOR, cause: error?.message || String(error) });
  }
}

export async function captureGeminiCanvasRpcSnapshotFromPage(page: any): Promise<GeminiCanvasRpcSnapshot> {
  const value = await page.evaluate(async () => {
    const html = String(document.documentElement?.innerHTML || "");
    return {
      at: (window as any).WIZ_global_data?.SNlM0e || html.match(/AOOh0P[^\"&<\s]+/)?.[0] || "",
      bl: (window as any).WIZ_global_data?.cfb2h || html.match(/boq_assistant-bard-web-server_[^\"'&<\\]+/)?.[0] || "",
      fsid: String((window as any).WIZ_global_data?.FdrFJe || ""),
      href: location.href,
      ua: navigator.userAgent
    };
  });
  const pageUrl = String(value?.href || page.url?.() || GEMINI_FRESH_COMPOSER_URL);
  if (loginRequiredForService("gemini", pageUrl)) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before Canvas RPC", { url: pageUrl });
  const at = String(value?.at || "");
  const bl = String(value?.bl || "");
  const fsid = String(value?.fsid || "");
  if (!at || !bl || !fsid) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC token capture did not find at/bl/f.sid on the logged-in page");
  return { at, bl, fsid, userAgent: String(value?.ua || "Mozilla/5.0"), pageUrl };
}

export async function fetchGeminiCanvasRpcInPage(page: any, request: GeminiCanvasRpcRequest): Promise<GeminiCanvasRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, method, headers, body, timeoutMs }: { url: string; method: string; headers: Record<string, string>; body: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, { method, credentials: "include", headers, body, signal: controller.signal });
      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text, headers: responseHeaders };
    } finally {
      clearTimeout(timer);
    }
  }, { url: request.url, method: request.method, headers: request.headers, body: request.body, timeoutMs: request.timeoutMs });
  return { ...result, elapsedMs: Date.now() - started };
}

function parseGeminiStreamPayloadLines(streamText: string): unknown[] {
  const chunks: unknown[] = [];
  for (const line of String(streamText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    try { chunks.push(JSON.parse(trimmed)); }
    catch (error) { throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_JSON, `Gemini Canvas RPC response chunk was not valid JSON: ${errorMessageFromUnknown(error, "parse error")}`); }
  }
  if (!chunks.length) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini Canvas RPC response did not contain length-prefixed JSON chunks");
  return chunks;
}

function tryParseNestedJson(value: string): unknown | undefined {
  if (!value || !/^[\[{]/.test(value.trim())) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function normalizedText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function usefulCanvasString(value: string): boolean {
  const text = normalizedText(value);
  if (text.length < 20) return false;
  if (/^(wrb\.fr|af\.httprm|di|e|und|US|en)$/i.test(text)) return false;
  if (/SWML_DESCRIPTION|google\.com\/maps|googleusercontent\.com\/(?:immersive_entry_chip|deep_research_confirmation_content)/i.test(text)) return false;
  if (/^https?:\/\//i.test(text) || /^\/\/www\.google\.com\//i.test(text)) return false;
  if (/^(c|r|rc)_[a-f0-9]+$/i.test(text)) return false;
  return true;
}

function collectDecodedStrings(value: unknown, strings: string[]): void {
  if (typeof value === "string") {
    const nested = tryParseNestedJson(value);
    if (nested !== undefined) collectDecodedStrings(nested, strings);
    else if (usefulCanvasString(value)) strings.push(normalizedText(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDecodedStrings(item, strings);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectDecodedStrings(item, strings);
  }
}

function extractFirstMatch(value: unknown, re: RegExp): string | null {
  if (typeof value === "string") {
    const match = re.exec(value);
    if (match) return match[1] || match[0];
    const nested = tryParseNestedJson(value);
    if (nested !== undefined) return extractFirstMatch(nested, re);
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstMatch(item, re);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = extractFirstMatch(item, re);
      if (found) return found;
    }
  }
  return null;
}

export function decodeGeminiCanvasRpcStream(streamText: string): GeminiCanvasRpcDecodedResponse {
  const chunks = parseGeminiStreamPayloadLines(streamText);
  const strings: string[] = [];
  for (const chunk of chunks) collectDecodedStrings(chunk, strings);
  const markdownOrHtml = strings
    .filter((value) => /<!doctype|<html[\s>]|^#\s|\n#\s|```html|\|\s*:---/i.test(value))
    .sort((a, b) => b.length - a.length)[0] || "";
  const text = strings.filter((value) => !/^```/.test(value)).sort((a, b) => b.length - a.length)[0] || markdownOrHtml || "";
  const conversationId = extractFirstMatch(chunks, /\bc_[a-f0-9]+\b/i);
  const responseId = extractFirstMatch(chunks, /\br_[a-f0-9]+\b/i);
  const artifactUrl = extractFirstMatch(chunks, /(https?:\/\/googleusercontent\.com\/immersive_entry_chip\/\d+)/i);
  return { text, canvasHtml: markdownOrHtml || text, conversationId, responseId, artifactUrl };
}

function canvasErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = geminiCanvasRpcErrorCode(error);
  return safeOutput({
    canvas_opened: false,
    edit_applied: false,
    ai_action_applied: false,
    canvas_html_before: "",
    canvas_html_after: "",
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function sensitiveContentGuard(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, message, ...extra });
}

export async function webAiGeminiCanvasRpcWithPage(args: any, page: any, fetchRpc: GeminiCanvasRpcFetch = fetchGeminiCanvasRpcInPage): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs(args);
  const started = nowMs(effective);
  try {
    const variant = resolveGeminiCanvasRpcVariant(effective, String(effective.__tool || "webai_gemini_canvas_edit"));
    if (variant === "noop") return safeOutput({ canvas_opened: false, edit_applied: false, ai_action_applied: false, canvas_html_before: "", canvas_html_after: "", errorCode: null, backend: "rpc" });
    if (!geminiCanvasRpcVariantAvailable(variant)) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini Canvas variant ${variant} is RPC_NOT_AVAILABLE from Wave B4 research`);
    if (effective.prompt) assertPromptAllowed(effective.prompt);
    if (effective.edit_text) assertPromptAllowed(effective.edit_text);
    if (effective.prompt && effective.confirmed !== true) return sensitiveContentGuard("Submitting a Gemini Canvas prompt requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "canvas_edit" });
    await prepareGeminiCanvasRpcPage(page, { ...effective, __forceFreshComposer: Boolean(effective.prompt) });
    const snapshot = effective.__cdpSnapshot || await captureGeminiCanvasRpcSnapshotFromPage(page);
    const request = buildGeminiCanvasRpcRequest(effective, snapshot, undefined, variant);
    const response = await fetchRpc(page, request);
    if (response.status < 200 || response.status >= 300) throw new GeminiCanvasRpcToolError(httpStatusErrorCode(response.status, response.text || ""), `Gemini Canvas RPC ${variant} returned HTTP ${response.status}`);
    const decoded = decodeGeminiCanvasRpcStream(response.text);
    if (!decoded.canvasHtml.trim()) throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_JSON, `Gemini Canvas RPC ${variant} completed without decoded Canvas content`);
    return safeOutput({
      canvas_opened: true,
      edit_applied: false,
      ai_action_applied: false,
      canvas_html_before: decoded.canvasHtml,
      canvas_html_after: decoded.canvasHtml,
      chat_url: decoded.conversationId ? `https://gemini.google.com/app/${decoded.conversationId}` : (snapshot.pageUrl || targetUrlForGemini(effective)),
      wait_ms: response.elapsedMs ?? (nowMs(effective) - started),
      elapsed_ms: nowMs(effective) - started,
      backend: "rpc",
      rpc_variant: variant,
      artifact_url: decoded.artifactUrl,
      errorCode: null
    });
  } catch (error: any) {
    return canvasErrorOutput(effective, error, { elapsed_ms: nowMs(effective) - started });
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

export async function webAiGeminiCanvasRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs(args);
  const variant = resolveGeminiCanvasRpcVariant(effective, String(effective.__tool || "webai_gemini_canvas_edit"));
  if (variant !== "noop" && !geminiCanvasRpcVariantAvailable(variant)) return canvasErrorOutput(effective, new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini Canvas variant ${variant} is RPC_NOT_AVAILABLE from Wave B4 research`));
  if (effective.prompt && effective.confirmed !== true) return sensitiveContentGuard("Submitting a Gemini Canvas prompt requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "canvas_edit" });
  const lease = acquireProfileLease(effective.profile);
  let browser: any;
  try {
    browser = await connectBrowserForGeminiProfile(effective, runtime);
    const page = await geminiOriginPage(browser, { ...effective, __forceFreshComposer: Boolean(effective.prompt) });
    return await webAiGeminiCanvasRpcWithPage(effective, page, effective.__fetch || fetchGeminiCanvasRpcInPage);
  } catch (error: any) {
    return canvasErrorOutput(effective, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

function docsErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = geminiCanvasRpcErrorCode(error);
  return safeOutput({
    docs_url: null,
    docs_doc_id: null,
    title: args?.title || null,
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function geminiCanvasToDocsDocumentPrompt(prompt: string): string {
  const raw = String(prompt || "").trim();
  const stripped = raw
    .replace(/,?\s*then\s+export\s+to\s+Google\s+Docs\.?/ig, "")
    .replace(/\bexport\s+(?:it\s+)?to\s+Google\s+Docs\b\.?/ig, "")
    .trim();
  const base = stripped || raw || "a short editable document";
  if (/editable document/i.test(raw) && /not code|not an app/i.test(raw)) return raw;
  return `Use Canvas to draft an editable document for this request: ${base}. Make it a document, not code or an app. Do not open external apps.`;
}

function geminiCanvasToDocsReadyTimeoutMs(args: any): number {
  const configured = responseTimeoutMs(args);
  return Math.min(configured, 150000);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms)));
}

async function waitForTimeoutCompat(page: any, ms: number): Promise<void> {
  if (typeof page?.waitForTimeout === "function") {
    await page.waitForTimeout(ms).catch(() => undefined);
    return;
  }
  await sleepMs(ms);
}

async function readGeminiCanvasShareButtonState(page: any): Promise<{ found: boolean; disabled: boolean; aria: string; text: string }> {
  const read = (node: Element | null) => {
    const button = node as HTMLButtonElement | null;
    return {
      found: Boolean(node),
      disabled: Boolean(button?.disabled || node?.getAttribute("aria-disabled") === "true"),
      aria: String(node?.getAttribute("aria-label") || ""),
      text: String(node?.textContent || "").replace(/\s+/g, " ").trim()
    };
  };
  if (typeof page?.locator === "function") {
    const locator = page.locator(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR).first();
    return await locator.evaluate(read).catch(() => ({ found: false, disabled: true, aria: "", text: "" }));
  }
  if (typeof page?.evaluate === "function") {
    return await page.evaluate((selector: string) => {
      const node = document.querySelector(selector);
      const button = node as HTMLButtonElement | null;
      return {
        found: Boolean(node),
        disabled: Boolean(button?.disabled || node?.getAttribute("aria-disabled") === "true"),
        aria: String(node?.getAttribute("aria-label") || ""),
        text: String(node?.textContent || "").replace(/\s+/g, " ").trim()
      };
    }, GEMINI_CANVAS_SHARE_BUTTON_SELECTOR);
  }
  return { found: false, disabled: true, aria: "", text: "" };
}

async function waitForGeminiCanvasShareButton(page: any, timeoutMs: number): Promise<{ reloaded: boolean; aria: string }> {
  try {
    await page.waitForSelector?.(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeout: timeoutMs, timeoutMs });
  } catch (error: any) {
    throw new GeminiCanvasRpcToolError(
      ConsumerErrorCodes.COMMAND_TIMEOUT,
      "Gemini Canvas did not finish rendering before timeout",
      { selector: GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, cause: error?.message || String(error) }
    );
  }

  const deadline = Date.now() + Math.max(1, timeoutMs);
  let reloaded = false;
  let last = await readGeminiCanvasShareButtonState(page);
  while (Date.now() <= deadline) {
    last = await readGeminiCanvasShareButtonState(page).catch(() => last);
    if (last.found && !last.disabled) return { reloaded, aria: last.aria };
    if (!reloaded && /skipped responses?.*reload/i.test(last.aria)) {
      reloaded = true;
      await page.reload?.({ waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 30000) }).catch(() => undefined);
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      await page.waitForSelector?.(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { state: "visible", timeout: Math.min(timeoutMs, 60000), timeoutMs: Math.min(timeoutMs, 60000) }).catch(() => undefined);
      continue;
    }
    await waitForTimeoutCompat(page, 1000);
  }
  throw new GeminiCanvasRpcToolError(
    ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED,
    "Gemini Canvas share/export button remained disabled before Docs export",
    { selector: GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, aria_label: last.aria, reloaded }
  );
}

async function fillGeminiCanvasPrompt(page: any, prompt: string, timeoutMs: number): Promise<void> {
  try {
    await page.waitForSelector?.(GEMINI_CANVAS_PROMPT_SELECTOR, { state: "visible", timeout: timeoutMs, timeoutMs });
    const locator = page.locator?.(GEMINI_CANVAS_PROMPT_SELECTOR).first?.();
    if (locator && typeof locator.fill === "function") {
      await locator.fill(prompt, { timeout: timeoutMs });
      return;
    }
    if (typeof page.fill === "function") {
      await page.fill(GEMINI_CANVAS_PROMPT_SELECTOR, prompt, { timeout: timeoutMs });
      return;
    }
  } catch {
    // Fall through to keyboard/evaluate path below.
  }

  try {
    const locator = page.locator?.(GEMINI_CANVAS_PROMPT_SELECTOR).first?.();
    await locator?.click?.({ timeout: timeoutMs });
    await page.keyboard?.press?.(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
    await page.keyboard?.type?.(prompt, { delay: 1 });
    return;
  } catch (error: any) {
    throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas prompt composer was not found", { selector: GEMINI_CANVAS_PROMPT_SELECTOR, cause: error?.message || String(error) });
  }
}

async function clickGeminiSendButton(page: any, timeoutMs: number): Promise<void> {
  await waitForTimeoutCompat(page, 700);
  try {
    await page.waitForSelector?.(GEMINI_SEND_BUTTON_SELECTOR, { state: "visible", timeout: timeoutMs, timeoutMs });
    const locator = page.locator?.(GEMINI_SEND_BUTTON_SELECTOR).first?.();
    if (locator && typeof locator.click === "function") {
      await locator.click({ timeout: timeoutMs });
      return;
    }
    if (typeof page.click === "function") {
      await page.click(GEMINI_SEND_BUTTON_SELECTOR, { timeout: timeoutMs });
      return;
    }
  } catch (error: any) {
    throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Send message button was not found", { selector: GEMINI_SEND_BUTTON_SELECTOR, cause: error?.message || String(error) });
  }
  throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Send message button was not found", { selector: GEMINI_SEND_BUTTON_SELECTOR });
}

async function overlayTextSnapshot(page: any): Promise<Record<string, unknown>> {
  if (typeof page?.evaluate !== "function") return {};
  return await page.evaluate(() => {
    const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
    const panes = Array.from(document.querySelectorAll(".cdk-overlay-pane"));
    return {
      pane_count: panes.length,
      panes: panes.map((pane, index) => ({ index, text: clean(pane.textContent).slice(0, 1000) }))
    };
  }).catch(() => ({}));
}

async function clickGeminiExportDocsMenuItem(page: any, timeoutMs: number): Promise<void> {
  try {
    await page.waitForSelector?.(GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, { state: "visible", timeout: timeoutMs, timeoutMs });
    const locator = page.locator?.(GEMINI_CANVAS_EXPORT_DOCS_SELECTOR);
    const count = Number(await locator?.count?.().catch(() => 0) || 0);
    for (let index = 0; index < Math.max(count, 1); index += 1) {
      const item = count ? locator.nth(index) : locator?.first?.();
      if (!item || typeof item.click !== "function") continue;
      const visible = typeof item.isVisible === "function" ? await item.isVisible().catch(() => false) : true;
      if (!visible && count) continue;
      await item.click({ timeout: timeoutMs });
      return;
    }
  } catch {
    // Try the live-probed overlay text path below before surfacing drift.
  }

  if (typeof page?.evaluate === "function") {
    const clicked = await page.evaluate(() => {
      const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
      const panes = Array.from(document.querySelectorAll(".cdk-overlay-pane"));
      const roots = [...panes.slice().reverse(), document];
      for (const root of roots) {
        const item = Array.from(root.querySelectorAll("button,[role='menuitem'],gem-menu-item,export-to-docs-button"))
          .find((node) => /Export\s*(to)?\s*(Google\s*)?Docs|Google Docs/i.test(clean(node.textContent) || String(node.getAttribute("aria-label") || ""))) as HTMLElement | undefined;
        if (item) {
          item.click();
          return { text: clean(item.textContent), aria: item.getAttribute("aria-label"), test_id: item.getAttribute("data-test-id") || item.getAttribute("data-testid"), tag: item.tagName };
        }
      }
      return null;
    }).catch(() => null);
    if (clicked) return;
  }

  throw new GeminiCanvasRpcToolError(
    ConsumerErrorCodes.ELEMENT_NOT_FOUND,
    "Gemini Canvas export-to-Docs menuitem was not found",
    { selector: GEMINI_CANVAS_EXPORT_DOCS_SELECTOR, ...(await overlayTextSnapshot(page)) }
  );
}

async function awaitSpawnedDocsPage(page: any, timeoutMs: number): Promise<{ url: string; docPage: any } | null> {
  const context = typeof page?.context === "function" ? page.context() : undefined;
  if (!context || typeof context.pages !== "function") return null;
  const deadline = Date.now() + Math.max(1, timeoutMs);
  while (Date.now() < deadline) {
    for (const candidate of context.pages() || []) {
      const url = typeof candidate?.url === "function" ? String(candidate.url() || "") : "";
      if (GOOGLE_DOCS_URL_RE.test(url)) return { url, docPage: candidate };
    }
    await waitForTimeoutCompat(page, 1000);
  }
  return null;
}

export async function webAiGeminiCanvasToDocsRpcWithPage(args: any, page: any): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs({ ...(args || {}), __tool: "webai_gemini_canvas_to_docs" });
  const started = nowMs(effective);
  const title = effective.title || null;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_canvas_to_docs requires a string prompt");
    assertPromptAllowed(effective.prompt);
    assertNotPublishDeniedLabel("Export to Docs", { tool: "webai.gemini.canvas_to_docs" });
    await prepareGeminiCanvasRpcPage(page, { ...effective, __forceFreshComposer: true });
    const prompt = geminiCanvasToDocsDocumentPrompt(effective.prompt);
    await fillGeminiCanvasPrompt(page, prompt, Math.min(responseTimeoutMs(effective), 15000));
    await clickGeminiSendButton(page, 10000);
    const share = await waitForGeminiCanvasShareButton(page, geminiCanvasToDocsReadyTimeoutMs(effective));
    await dismissGeminiOverlay(page).catch(() => undefined);
    const shareLocator = page.locator?.(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR).first?.();
    if (shareLocator && typeof shareLocator.click === "function") {
      await shareLocator.click({ timeout: 10000 });
    } else if (typeof page.click === "function") {
      await page.click(GEMINI_CANVAS_SHARE_BUTTON_SELECTOR, { timeout: 10000 });
    } else {
      throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "Gemini Canvas share/export button was not found", { selector: GEMINI_CANVAS_SHARE_BUTTON_SELECTOR });
    }
    await clickGeminiExportDocsMenuItem(page, 10000);
    const spawned = await awaitSpawnedDocsPage(page, Number(effective.timeout_ms || effective.timeoutMs || 90000));
    const docsUrl = spawned?.url || null;
    const docId = docsUrl ? GOOGLE_DOCS_URL_RE.exec(docsUrl)?.[1] || null : null;
    if (spawned?.docPage && typeof spawned.docPage.waitForLoadState === "function") {
      await spawned.docPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => undefined);
    }
    if (spawned?.docPage && spawned.docPage !== page && typeof spawned.docPage.close === "function") {
      await spawned.docPage.close().catch(() => undefined);
    }
    if (!docId || !docsUrl) {
      throw new GeminiCanvasRpcToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Gemini Canvas export did not spawn a docs.google.com document");
    }
    return safeOutput({
      docs_url: `https://docs.google.com/document/d/${docId}/edit`,
      docs_doc_id: docId,
      title,
      ok: true,
      chat_url: String(page.url?.() || targetUrlForGemini(effective)),
      wait_ms: nowMs(effective) - started,
      elapsed_ms: nowMs(effective) - started,
      backend: "rpc-dom-export",
      share_reloaded: share.reloaded,
      errorCode: null
    });
  } catch (error: any) {
    return docsErrorOutput(effective, error, { elapsed_ms: nowMs(effective) - started });
  }
}

export async function webAiGeminiCanvasToDocsRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = effectiveGeminiArgs({ ...(args || {}), __tool: "webai_gemini_canvas_to_docs" });
  const lease = acquireProfileLease(effective.profile);
  let browser: any;
  try {
    browser = await connectBrowserForGeminiProfile(effective, runtime);
    const page = await geminiOriginPage(browser, { ...effective, __forceFreshComposer: true });
    return await webAiGeminiCanvasToDocsRpcWithPage(effective, page);
  } catch (error: any) {
    return docsErrorOutput(effective, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    releaseProfileLease(effective.profile, lease);
  }
}

export const editGeminiCanvasRpc = webAiGeminiCanvasRpc;
