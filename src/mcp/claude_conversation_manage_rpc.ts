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

const DEFAULT_CLAUDE_PROFILE = "claude-9224";
const DEFAULT_CLAUDE_CDP_PORT = 9224;
const CLAUDE_FRESH_URL = "https://claude.ai/new";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaudeConversationManageRpcRequest {
  action: string;
  purpose: "capture_probe" | "conversation_list" | "conversation_details";
  method: "GET";
  url: string;
  profile: string;
  timeoutMs: number;
}

export interface ClaudeConversationManageRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
}

export type ClaudeConversationManageRpcFetch = (request: ClaudeConversationManageRpcRequest) => Promise<ClaudeConversationManageRpcFetchResult>;

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function claudeConversationRpcErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|quota|overage|lockout/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403|account_session_invalid/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function httpStatusErrorCode(status: number, body: string): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.UNKNOWN;
}

function conversationErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeConversationRpcErrorCode(error);
  return safeOutput({
    ok: false,
    action: String(args?.action || ""),
    url: CLAUDE_FRESH_URL,
    items: [],
    results: [],
    results_count: 0,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function humanHandoffRequired(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, error_code: ConsumerErrorCodes.HUMAN_HANDOFF_REQUIRED, reason, ...extra });
}

function sensitiveContentGuard(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, message, ...extra });
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function parseJsonMaybe(text: string): unknown {
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function syncSettingsPath(orgId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/sync/settings`;
}

function conversationsPath(orgId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations_v2?limit=30&starred=false&consistency=eventual`;
}

function conversationDetailsPath(orgId: string, conversationId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(conversationId)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual`;
}

function conversationIdFromUrl(url: string): string | null {
  return /\/(?:chat|c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(String(url || ""))?.[1] || null;
}

function effectiveConversationId(args: any): string | null {
  const explicit = String(args?.conversation_id || args?.conversationId || "").trim();
  if (UUID_RE.test(explicit)) return explicit;
  return conversationIdFromUrl(String(args?.tab_url_contains || args?.url || ""));
}

export function buildClaudeConversationManageRpcRequests(args: any, orgId: string): ClaudeConversationManageRpcRequest[] {
  const action = String(args?.action || "list");
  const profile = String(args?.profile || DEFAULT_CLAUDE_PROFILE);
  const timeoutMs = responseTimeoutMs(args);
  if (action === "list" || action === "search") {
    return [
      { action, purpose: "capture_probe", method: "GET", url: syncSettingsPath(orgId), profile, timeoutMs },
      { action, purpose: "conversation_list", method: "GET", url: conversationsPath(orgId), profile, timeoutMs }
    ];
  }
  if (action === "share") {
    const conversationId = effectiveConversationId(args);
    if (!conversationId) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude RPC share requires tab_url_contains or conversation_id for confirmed share verification");
    return [{ action, purpose: "conversation_details", method: "GET", url: conversationDetailsPath(orgId, conversationId), profile, timeoutMs }];
  }
  throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `Unsupported Claude conversation action: ${action}`);
}

function conversationItems(json: unknown): Array<Record<string, unknown>> {
  const source = Array.isArray(json)
    ? json
    : (json && typeof json === "object"
      ? ((json as Record<string, unknown>).conversations || (json as Record<string, unknown>).items || (json as Record<string, unknown>).data)
      : []);
  if (!Array.isArray(source)) return [];
  return source.map((item: any) => {
    const uuid = String(item?.uuid || item?.id || "");
    const text = String(item?.name || item?.title || item?.summary || uuid || "").trim();
    return {
      text: text.slice(0, 240),
      ...(uuid ? { href: `https://claude.ai/chat/${uuid}`, conversationId: uuid } : {})
    };
  }).filter((item) => item.text || item.href);
}

async function fetchClaudeConversationInPage(page: any, request: ClaudeConversationManageRpcRequest): Promise<ClaudeConversationManageRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, timeoutMs }: { url: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        signal: controller.signal
      });
      const text = await response.text();
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text };
    } finally {
      clearTimeout(timer);
    }
  }, { url: request.url, timeoutMs: request.timeoutMs });
  return { ...result, elapsedMs: Date.now() - started };
}

async function connectBrowserForProfile(args: any, runtime?: BrowserToolRuntime): Promise<any> {
  const profile = String(args?.profile || DEFAULT_CLAUDE_PROFILE);
  if (runtime?.launcher && typeof runtime.launcher.status === "function" && typeof runtime.launcher.connectOverCdp === "function") {
    const status = await runtime.launcher.status(profile);
    if (!status?.connected) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, `CDP endpoint is not connected for profile ${profile}`);
    return runtime.launcher.connectOverCdp(status);
  }
  const cdpPort = Number(args?.cdp_port ?? args?.cdpPort ?? (/(?:-|:)(\d{4,5})$/.exec(profile)?.[1]) ?? DEFAULT_CLAUDE_CDP_PORT);
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
  const currentUrl = String(page.url?.() || "");
  if (!isClaude(currentUrl)) {
    await page.goto?.(CLAUDE_FRESH_URL, { waitUntil: "domcontentloaded", timeout: Math.min(responseTimeoutMs(args), 30000) });
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
      if (Array.isArray(value)) { for (const item of value) { const found = findUuid(item); if (found) return found; } return null; }
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
    } catch {
      return null;
    }
  });
  if (typeof orgId === "string" && UUID_RE.test(orgId)) return orgId;
  throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization could not be resolved from the logged-in browser context");
}

export async function webAiClaudeConversationManageRpcWithFetch(
  args: any,
  fetchRpc: ClaudeConversationManageRpcFetch,
  options: { orgId?: string } = {}
): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const action = String(effective.action || "list");
  if (action === "sidebar_options") {
    return humanHandoffRequired("Claude sidebar kebab opens a Radix portal that is not reliably snapshot-accessible from the CLI.", { action: "sidebar_options", reason: "sidebar_kebab_radix_portal_unreliable" });
  }
  if (action === "share" && effective.confirmed !== true) {
    return sensitiveContentGuard("Opening Claude conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share", conversationId: null });
  }
  let httpStatus: number | null = null;
  try {
    const orgId = options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId;
    if (!orgId || !UUID_RE.test(String(orgId))) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC conversation_manage");
    const requests = buildClaudeConversationManageRpcRequests({ ...effective, action }, String(orgId));
    let selectedResponse: ClaudeConversationManageRpcFetchResult | null = null;
    for (const request of requests) {
      const response = await fetchRpc(request);
      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        throw new WebAiToolError(httpStatusErrorCode(response.status, response.text || ""), `Claude conversation_manage RPC ${request.purpose} returned HTTP ${response.status}`);
      }
      selectedResponse = response;
    }
    if (action === "share") {
      const conversationId = effectiveConversationId(effective);
      return safeOutput({ action, dialog_opened: true, url: conversationId ? `https://claude.ai/chat/${conversationId}` : CLAUDE_FRESH_URL, conversationId, errorCode: null, http_status: httpStatus });
    }
    const allItems = conversationItems(parseJsonMaybe(selectedResponse?.text || ""));
    const query = typeof effective.query === "string" ? effective.query.trim().toLowerCase() : "";
    const results = query ? allItems.filter((item) => `${item.text || ""} ${item.href || ""}`.toLowerCase().includes(query)) : allItems;
    return safeOutput({ action, url: CLAUDE_FRESH_URL, items: results, results, results_count: results.length, errorCode: null, http_status: httpStatus });
  } catch (error: any) {
    return conversationErrorOutput({ ...effective, action }, error, { http_status: httpStatus });
  }
}

export async function webAiClaudeConversationManageRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const action = String(effective.action || "list");
  if (action === "sidebar_options") {
    return humanHandoffRequired("Claude sidebar kebab opens a Radix portal that is not reliably snapshot-accessible from the CLI.", { action: "sidebar_options", reason: "sidebar_kebab_radix_portal_unreliable" });
  }
  if (action === "share" && effective.confirmed !== true) {
    return sensitiveContentGuard("Opening Claude conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share", conversationId: null });
  }
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      return conversationErrorOutput({ ...effective, action }, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before conversation management"), { url: String(page.url?.() || CLAUDE_FRESH_URL) });
    }
    const orgId = await activeClaudeOrgId(page, effective);
    return await webAiClaudeConversationManageRpcWithFetch({ ...effective, action, organization_id: orgId }, (request) => fetchClaudeConversationInPage(page, request), { orgId });
  } catch (error: any) {
    return conversationErrorOutput({ ...effective, action }, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
