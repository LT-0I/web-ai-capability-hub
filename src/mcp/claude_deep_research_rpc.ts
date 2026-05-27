const crypto = require("node:crypto");
import { chromium } from "playwright";

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import { assertPromptAllowed, PromptPolicyDeniedError } from "../safety/promptDeny";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  loginRequiredForService,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";
import { buildClaudeRpcPayload, decodeClaudeRpcSseEnvelope } from "./claude_send_prompt_rpc";

const CLAUDE_FRESH_URL = "https://claude.ai/new";
const DEFAULT_CLAUDE_PROFILE = "claude-9224";
const DEFAULT_CLAUDE_CDP_PORT = 9224;
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaudeDeepResearchRpcRequest {
  url: string;
  profile: string;
  timeoutMs: number;
  body: string;
}

export interface ClaudeDeepResearchRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
  headers?: Record<string, string>;
}

export type ClaudeDeepResearchRpcFetch = (request: ClaudeDeepResearchRpcRequest) => Promise<ClaudeDeepResearchRpcFetchResult>;

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function normalizeUrlLikeTarget(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) return `https://${value}`;
  return undefined;
}

function targetUrlForClaude(args: any): string {
  return normalizeUrlLikeTarget(args?.url) || normalizeUrlLikeTarget(args?.tab_url_contains) || CLAUDE_FRESH_URL;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? args?.timeout_ms ?? args?.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function safeTaskId(): string { return `claude_research_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`; }

function claudeDeepResearchRpcErrorCode(error: any): ConsumerErrorCode {
  if (error instanceof PromptPolicyDeniedError) return ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|message_limit|quota|overage|lockout/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403|account_session_invalid/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function httpStatusErrorCode(status: number, body: string): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|message_limit|overage/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.UNKNOWN;
}

function deepResearchErrorOutput(args: any, taskId: string, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeDeepResearchRpcErrorCode(error);
  return safeOutput({
    ok: false,
    service: "claude",
    task_id: taskId,
    status: "failed",
    chat_url: targetUrlForClaude(args || {}),
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function conversationIdFromUrl(url: string): string | undefined {
  const match = /\/(?:chat|c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(url);
  return match?.[1];
}

function effectiveConversationId(args: any, fallback?: string): string {
  const explicit = String(args?.conversation_id || args?.conversationId || "").trim();
  if (UUID_RE.test(explicit)) return explicit;
  if (fallback && UUID_RE.test(fallback)) return fallback;
  return crypto.randomUUID();
}

function completionUrl(orgId: string, conversationId: string): string {
  return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
}

export function buildClaudeDeepResearchPayload(args: any): Record<string, unknown> {
  const payload: Record<string, any> = buildClaudeRpcPayload(args);
  payload.create_conversation_params = {
    ...(payload.create_conversation_params || {}),
    compass_mode: "advanced",
    paprika_mode: null
  };
  return payload;
}

export async function webAiClaudeDeepResearchRpcWithFetch(
  args: any,
  fetchCompletion: ClaudeDeepResearchRpcFetch,
  options: { orgId?: string; conversationId?: string; started?: number; taskId?: string } = {}
): Promise<Record<string, unknown>> {
  const started = options.started || Date.now();
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const taskId = options.taskId || safeTaskId();
  let conversationId: string | undefined;
  let httpStatus: number | null = null;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_deep_research requires a string prompt");
    assertPromptAllowed(effective.prompt);
    const orgId = String(options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId || "").trim();
    if (!UUID_RE.test(orgId)) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC deep_research");
    conversationId = effectiveConversationId(effective, options.conversationId);
    const request = {
      url: completionUrl(orgId, conversationId),
      profile: String(effective.profile),
      timeoutMs: responseTimeoutMs(effective),
      body: JSON.stringify(buildClaudeDeepResearchPayload({ ...effective, organization_id: orgId, conversation_id: conversationId }))
    };
    const fetchStarted = Date.now();
    const response = await fetchCompletion(request);
    httpStatus = response.status;
    const waitMs = response.elapsedMs ?? (Date.now() - fetchStarted);
    if (response.status !== 200) {
      const code = httpStatusErrorCode(response.status, response.text || "");
      return deepResearchErrorOutput(effective, taskId, new WebAiToolError(code, `Claude RPC completion returned HTTP ${response.status}`), {
        chat_url: `https://claude.ai/chat/${conversationId}`,
        conversation_id: conversationId,
        http_status: response.status
      });
    }
    const decoded = decodeClaudeRpcSseEnvelope(response.text);
    void decoded;
    return safeOutput({
      task_id: taskId,
      status: "queued",
      chat_url: `https://claude.ai/chat/${conversationId}`,
      conversation_id: conversationId,
      wait_ms: waitMs,
      http_status: response.status,
      backend: "rpc",
      errorCode: null
    });
  } catch (error: any) {
    return deepResearchErrorOutput(effective, taskId, error, {
      ...(conversationId ? { chat_url: `https://claude.ai/chat/${conversationId}`, conversation_id: conversationId } : {}),
      http_status: httpStatus
    });
  }
}

async function fetchClaudeDeepResearchInPage(page: any, request: ClaudeDeepResearchRpcRequest): Promise<ClaudeDeepResearchRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, body, timeoutMs }: { url: string; body: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { accept: "text/event-stream", "content-type": "application/json" }, body, signal: controller.signal });
      const text = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text, headers };
    } finally { clearTimeout(timer); }
  }, { url: request.url, body: request.body, timeoutMs: request.timeoutMs });
  return { ...result, elapsedMs: Date.now() - started };
}

async function connectBrowserForProfile(args: any, runtime?: BrowserToolRuntime): Promise<any> {
  const profile = String(args?.profile || DEFAULT_CLAUDE_PROFILE);
  if (runtime?.launcher && typeof runtime.launcher.status === "function" && typeof runtime.launcher.connectOverCdp === "function") {
    const status = await runtime.launcher.status(profile);
    if (!status?.connected) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, `CDP endpoint is not connected for profile ${profile}`);
    return runtime.launcher.connectOverCdp(status);
  }
  const cdpPort = Number(args?.cdp_port ?? args?.cdpPort ?? (/(\d{4,5})$/.exec(profile)?.[1]) ?? DEFAULT_CLAUDE_CDP_PORT);
  const endpoint = String(args?.cdp_endpoint || args?.cdpEndpoint || `http://127.0.0.1:${cdpPort}`);
  return chromium.connectOverCDP(endpoint);
}

async function claudeOriginPage(browser: any, args: any): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, "No browser context is available from the Claude CDP connection");
  const pages = context.pages?.() || [];
  const isClaude = (url: string) => {
    try { const parsed = new URL(url); return parsed.hostname === "claude.ai" || parsed.hostname === "www.claude.ai"; } catch { return false; }
  };
  let page = pages.find((candidate: any) => isClaude(String(candidate.url?.() || "")));
  if (!page) page = await context.newPage();
  const target = targetUrlForClaude(args);
  const currentUrl = String(page.url?.() || "");
  if (!isClaude(currentUrl)) {
    await page.goto?.(target, { waitUntil: "domcontentloaded", timeout: Math.min(args?.timeout_ms || 60000, 30000) });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  }
  await page.bringToFront?.().catch?.(() => undefined);
  return page;
}

async function activeClaudeOrgId(page: any, args: any): Promise<string> {
  const explicit = String(args?.organization_id || args?.organizationId || args?.org_id || args?.orgId || "").trim();
  if (UUID_RE.test(explicit)) return explicit;
  const orgId = await page.evaluate(async () => {
    const cookieMatch = /(?:^|;\s*)lastActiveOrg=([^;]+)/.exec(document.cookie || "");
    if (cookieMatch?.[1]) return decodeURIComponent(cookieMatch[1]);
    const findUuid = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
      if (Array.isArray(value)) {
        for (const item of value) { const found = findUuid(item); if (found) return found; }
        return null;
      }
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of ["uuid", "id", "organization_uuid", "organizationUuid"]) { const found = findUuid(record[key]); if (found) return found; }
        for (const item of Object.values(record)) { const found = findUuid(item); if (found) return found; }
      }
      return null;
    };
    try {
      const response = await fetch("/api/organizations/discoverable", { credentials: "include" });
      if (!response.ok) return null;
      return findUuid(await response.json());
    } catch { return null; }
  });
  if (typeof orgId === "string" && UUID_RE.test(orgId)) return orgId;
  throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization could not be resolved from the logged-in browser context");
}

function persistRpcDeepResearchTask(runtime: BrowserToolRuntime | undefined, service: "claude", args: any, taskId: string, chatUrl: string): void {
  const database = runtime?.database;
  if (!database || typeof database.upsertWebAiTask !== "function") return;
  database.upsertWebAiTask({
    task_id: taskId,
    status: "queued",
    profile: args.profile || DEFAULT_CLAUDE_PROFILE,
    lease_id: "rpc",
    started_at: new Date().toISOString(),
    progress_label: `queued ${service} Deep Research task`,
    timeout_ms: args.timeout_ms || 1800000,
    result: { chat_url: chatUrl, backend: "rpc" }
  });
}

export async function webAiClaudeDeepResearchRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const taskId = safeTaskId();
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) return deepResearchErrorOutput(effective, taskId, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before Deep Research"), { chat_url: String(page.url?.() || targetUrlForClaude(effective)) });
    const orgId = await activeClaudeOrgId(page, effective);
    const pageConversationId = conversationIdFromUrl(String(page.url?.() || ""));
    const reusePageConversation = Boolean(effective.reuse_conversation || effective.conversation_id || effective.conversationId || /\/(?:chat|c)\//i.test(String(effective.url || effective.tab_url_contains || "")));
    const conversationId = reusePageConversation ? pageConversationId : undefined;
    const result = await webAiClaudeDeepResearchRpcWithFetch(
      { ...effective, organization_id: orgId, ...(conversationId ? { conversation_id: conversationId } : {}) },
      (request) => fetchClaudeDeepResearchInPage(page, request),
      { orgId, conversationId, taskId }
    );
    if ((result as any).errorCode === null) persistRpcDeepResearchTask(runtime, "claude", effective, taskId, String((result as any).chat_url || ""));
    return result;
  } catch (error: any) {
    return deepResearchErrorOutput(effective, taskId, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
