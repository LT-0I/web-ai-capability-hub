const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { chromium } from "playwright";

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  loginRequiredForService,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";

export type ClaudeDesignRpcOperation = "create_project" | "generate" | "get_html" | "present";

export interface ClaudeDesignRpcAvailabilityRecord {
  operation: ClaudeDesignRpcOperation;
  rpcAvailable: boolean;
  reason: string;
  surfaceUrlPattern: string;
  mountSelectors: string[];
  endpoint?: string;
}

export interface ClaudeDesignRpcRequest {
  operation: "get_html";
  url: string;
  profile: string;
  timeoutMs: number;
  body: string;
}

export interface ClaudeDesignRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
  headers?: Record<string, string>;
}

export type ClaudeDesignRpcFetch = (request: ClaudeDesignRpcRequest) => Promise<ClaudeDesignRpcFetchResult>;

const DESIGN_ROOT_URL = "https://claude.ai/design";
const DESIGN_GET_FILE_URL = "https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile";
const DEFAULT_CLAUDE_DESIGN_PROFILE = "claude-9224";
const DEFAULT_CLAUDE_DESIGN_CDP_PORT = 9224;
const DEFAULT_TIMEOUT_MS = 90000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUOTA_TEXT_RE = /quota|limit reached|usage limit|try again later|too many requests|rate limit/i;

const DESIGN_UNAVAILABLE_REASON = "Path C Claude Wave B4 DOM-nav recapture did not capture a stable replayable write RPC for this Claude Design operation; it remains known-DOM-only by write-time decision rather than runtime fallback.";

export const CLAUDE_DESIGN_RPC_AVAILABILITY: Record<ClaudeDesignRpcOperation, ClaudeDesignRpcAvailabilityRecord> = {
  create_project: {
    operation: "create_project",
    rpcAvailable: false,
    reason: DESIGN_UNAVAILABLE_REASON,
    surfaceUrlPattern: "https://claude.ai/design",
    mountSelectors: ['input[placeholder="Project name"]', '[data-testid="create-project-button"]']
  },
  generate: {
    operation: "generate",
    rpcAvailable: false,
    reason: DESIGN_UNAVAILABLE_REASON,
    surfaceUrlPattern: "https://claude.ai/design/p/<project_id>",
    mountSelectors: ['textarea[data-testid="chat-composer-input"]', '[data-testid="chat-send-button"]']
  },
  get_html: {
    operation: "get_html",
    rpcAvailable: true,
    reason: "DOM-nav recapture found Claude Design's same-origin Omelette GetFile RPC after the project viewer mounted; get_html can fetch file bytes directly without iframe DOM extraction.",
    surfaceUrlPattern: "https://claude.ai/design/p/<project_id>?file=<file.html>",
    mountSelectors: ['iframe[data-testid="html-viewer-iframe"]', 'iframe[src*="claudeusercontent.com"]'],
    endpoint: DESIGN_GET_FILE_URL
  },
  present: {
    operation: "present",
    rpcAvailable: false,
    reason: DESIGN_UNAVAILABLE_REASON,
    surfaceUrlPattern: "https://claude.ai/design/p/<project_id>?file=<file.html>",
    mountSelectors: ['button:has-text("Present")', 'iframe[data-testid="html-viewer-iframe"]']
  }
};

export function claudeDesignRpcAvailability(operation: ClaudeDesignRpcOperation): ClaudeDesignRpcAvailabilityRecord {
  return CLAUDE_DESIGN_RPC_AVAILABILITY[operation];
}

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function claudeDesignRpcErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|usage limit|too many requests|quota/i.test(message)) return ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED;
  if (/login|required|authorization|session|permission|401|403|account_session_invalid/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function httpStatusErrorCode(status: number, body: string): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|usage limit|too many requests|quota/i.test(body)) return ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.UNKNOWN;
}

function rpcUnavailable(operation: ClaudeDesignRpcOperation): Record<string, unknown> {
  const record = claudeDesignRpcAvailability(operation);
  return safeOutput({
    ok: false,
    errorCode: ConsumerErrorCodes.INVALID_ARGS,
    error_code: ConsumerErrorCodes.INVALID_ARGS,
    rpc_available: false,
    operation,
    reason: record.reason,
    surface_url_pattern: record.surfaceUrlPattern,
    mount_selectors: record.mountSelectors
  });
}

function designErrorOutput(error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeDesignRpcErrorCode(error);
  return safeOutput({
    ok: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    iframeArtifactSha256: "",
    savedPath: "",
    byteSize: 0,
    backend: "rpc",
    ...extra
  });
}

function projectIdFromUrl(projectUrl: string): string | null {
  try { return /\/design\/p\/([^/?#]+)/.exec(new URL(projectUrl).pathname)?.[1] || null; }
  catch { return /\/design\/p\/([^/?#]+)/.exec(projectUrl || "")?.[1] || null; }
}

function fileNameFromProjectUrl(projectUrl: string): string {
  try {
    const parsed = new URL(projectUrl);
    const file = parsed.searchParams.get("file") || "";
    return /\.html$/i.test(file) ? file : "index.html";
  } catch {
    const match = /[?&]file=([^&#]*\.html)(?:[&#]|$)/i.exec(projectUrl || "");
    if (!match) return "index.html";
    try { return decodeURIComponent(match[1].replace(/\+/g, " ")); }
    catch { return match[1] || "index.html"; }
  }
}

function viewerUrl(projectUrl: string): string {
  if (!projectUrl) return DESIGN_ROOT_URL;
  if (/[?&]file=[^&#]+\.html(?:[&#]|$)/i.test(projectUrl)) return projectUrl;
  try {
    const parsed = new URL(projectUrl);
    parsed.searchParams.set("file", "index.html");
    return parsed.toString();
  } catch {
    return `${projectUrl}${projectUrl.includes("?") ? "&" : "?"}file=index.html`;
  }
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? args?.response_timeout_ms ?? args?.responseTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function downloadDirFor(args: any): string {
  const dir = path.resolve(args?.download_dir || path.join(process.cwd(), "data", "downloads"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256Buffer(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(name: string): string {
  const cleaned = path.basename(String(name || "index.html")).replace(/[^a-zA-Z0-9._ -]+/g, "_").trim() || "index.html";
  return cleaned.toLowerCase().endsWith(".html") ? cleaned : `${cleaned}.html`;
}

function isRealHtmlMarkup(value: string): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed || /^https?:\/\/\S+$/i.test(trimmed)) return false;
  if (!/<!doctype\s+html\b|<html[\s>]|<body[\s>]|<(main|section|article|div|p|h[1-6]|canvas|svg)(?:\s|>)/i.test(trimmed)) return false;
  const visible = trimmed
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return visible.length > 0 || /<(canvas|svg|img|video|audio)\b/i.test(trimmed);
}

function decodeGetFileResponse(text: string): Buffer {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch (error) { throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, `Claude Design GetFile returned invalid JSON: ${errorMessageFromUnknown(error, "parse failed")}`); }
  if (!parsed || typeof parsed.content !== "string") throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, "Claude Design GetFile response did not include content");
  return Buffer.from(parsed.content, "base64");
}

export function buildClaudeDesignGetHtmlPayload(args: any): Record<string, unknown> {
  const projectId = projectIdFromUrl(String(args?.project_url || args?.projectUrl || ""));
  if (!projectId || !UUID_RE.test(projectId)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "project_url must include a Claude Design /design/p/<uuid> project id");
  return { projectId, path: fileNameFromProjectUrl(String(args?.project_url || args?.projectUrl || "")), raw: true };
}

export async function webAiClaudeDesignGetHtmlRpcWithFetch(
  args: any,
  fetchRpc: ClaudeDesignRpcFetch,
  options: { navigate?: (url: string, mountSelectors: string[], timeoutMs: number) => Promise<void>; started?: number } = {}
): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_DESIGN_PROFILE };
  const started = options.started || Date.now();
  const projectUrl = String(effective.project_url || effective.projectUrl || "");
  const mountSelectors = claudeDesignRpcAvailability("get_html").mountSelectors;
  let httpStatus: number | null = null;
  try {
    const projectId = projectIdFromUrl(projectUrl);
    if (!projectId || !UUID_RE.test(projectId)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "project_url must include a Claude Design /design/p/<uuid> project id");
    const fileName = fileNameFromProjectUrl(projectUrl);
    const surfaceUrl = viewerUrl(projectUrl);
    if (options.navigate) await options.navigate(surfaceUrl, mountSelectors, responseTimeoutMs(effective));
    const fetchStarted = Date.now();
    const response = await fetchRpc({
      operation: "get_html",
      url: DESIGN_GET_FILE_URL,
      profile: String(effective.profile),
      timeoutMs: responseTimeoutMs(effective),
      body: JSON.stringify({ projectId, path: fileName, raw: true })
    });
    httpStatus = response.status;
    if (response.status !== 200) {
      const code = httpStatusErrorCode(response.status, response.text || "");
      return designErrorOutput(new WebAiToolError(code, `Claude Design GetFile returned HTTP ${response.status}`), { projectUrl, fileName, http_status: response.status });
    }
    const bytes = decodeGetFileResponse(response.text);
    const html = new TextDecoder().decode(bytes);
    if (!isRealHtmlMarkup(html)) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "Claude Design GetFile response did not contain real HTML markup");
    const sha = sha256Buffer(bytes);
    const savedPath = path.join(downloadDirFor(effective), `${projectId}-${sha.slice(0, 12)}-${safeFileName(fileName)}`);
    fs.writeFileSync(savedPath, bytes);
    return safeOutput({
      iframeArtifactSha256: sha,
      savedPath,
      byteSize: bytes.length,
      projectUrl,
      fileName,
      wait_ms: response.elapsedMs ?? (Date.now() - fetchStarted),
      total_ms: Date.now() - started,
      http_status: response.status,
      backend: "rpc",
      rpc_endpoint: DESIGN_GET_FILE_URL,
      errorCode: null
    });
  } catch (error: any) {
    return designErrorOutput(error, { projectUrl, http_status: httpStatus });
  }
}

async function connectBrowserForProfile(args: any, runtime?: BrowserToolRuntime): Promise<any> {
  const profile = String(args?.profile || DEFAULT_CLAUDE_DESIGN_PROFILE);
  if (runtime?.launcher && typeof runtime.launcher.status === "function" && typeof runtime.launcher.connectOverCdp === "function") {
    const status = await runtime.launcher.status(profile);
    if (!status?.connected) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, `CDP endpoint is not connected for profile ${profile}`);
    return runtime.launcher.connectOverCdp(status);
  }
  const cdpPort = Number(args?.cdp_port ?? args?.cdpPort ?? /(\d{4,5})$/.exec(profile)?.[1] ?? DEFAULT_CLAUDE_DESIGN_CDP_PORT);
  return chromium.connectOverCDP(String(args?.cdp_endpoint || args?.cdpEndpoint || `http://127.0.0.1:${cdpPort}`));
}

async function designPage(browser: any, args: any): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, "No browser context is available from the Claude CDP connection");
  const projectUrl = String(args?.project_url || args?.projectUrl || DESIGN_ROOT_URL);
  const projectId = projectIdFromUrl(projectUrl);
  const pages = context.pages?.() || [];
  let page = pages.find((candidate: any) => /claude\.ai\/design\//i.test(String(candidate.url?.() || "")) && (!projectId || String(candidate.url?.() || "").includes(projectId)));
  if (!page) page = pages.find((candidate: any) => /^https:\/\/claude\.ai\//i.test(String(candidate.url?.() || ""))) || await context.newPage();
  return page;
}

async function navigateDesignSurface(page: any, surfaceUrl: string, mountSelectors: string[], timeoutMs: number): Promise<void> {
  await page.goto?.(surfaceUrl, { waitUntil: "domcontentloaded", timeout: Math.min(timeoutMs, 30000) });
  await page.waitForLoadState?.("domcontentloaded", { timeout: Math.min(timeoutMs, 15000) }).catch(() => undefined);
  const selector = mountSelectors.join(", ");
  await page.waitForSelector?.(selector, { state: "attached", timeout: Math.min(timeoutMs, 30000) }).catch(() => undefined);
  await page.bringToFront?.().catch?.(() => undefined);
  if (loginRequiredForService("claude", String(page.url?.() || ""))) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Design RPC");
  const text = await page.locator?.("body").innerText({ timeout: 3000 }).catch(() => "");
  if (typeof text === "string" && QUOTA_TEXT_RE.test(text)) throw new WebAiToolError(ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED, "Claude Design quota is exhausted");
}

async function fetchDesignRpcInPage(page: any, request: ClaudeDesignRpcRequest): Promise<ClaudeDesignRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, body, timeoutMs }: { url: string; body: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { accept: "application/json", "content-type": "application/json" }, body, signal: controller.signal });
      const text = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text, headers };
    } finally { clearTimeout(timer); }
  }, { url: request.url, body: request.body, timeoutMs: request.timeoutMs });
  return { ...result, elapsedMs: Date.now() - started };
}

export async function webAiClaudeDesignCreateProjectRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  void args; void runtime;
  return rpcUnavailable("create_project");
}

export async function webAiClaudeDesignGenerateRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  void args; void runtime;
  return rpcUnavailable("generate");
}

export async function webAiClaudeDesignGetHtmlRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_DESIGN_PROFILE };
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await designPage(browser, effective);
    return await webAiClaudeDesignGetHtmlRpcWithFetch(
      effective,
      (request) => fetchDesignRpcInPage(page, request),
      { navigate: (surfaceUrl, mountSelectors, timeoutMs) => navigateDesignSurface(page, surfaceUrl, mountSelectors, timeoutMs) }
    );
  } catch (error: any) {
    return designErrorOutput(error, { projectUrl: String(effective.project_url || effective.projectUrl || "") });
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}

export async function webAiClaudeDesignPresentRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  void args; void runtime;
  return rpcUnavailable("present");
}
