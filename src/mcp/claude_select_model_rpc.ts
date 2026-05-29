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
const CLAUDE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh", "max"]);
const CLAUDE_MODE_LEVELS = new Set(["auto", "extended", "off"]);
const THINKING_LEVELS = new Set([...CLAUDE_MODE_LEVELS, ...CLAUDE_EFFORT_LEVELS]);
const THINKING_LEVELS_LABEL = "auto, extended, off, low, medium, high, xhigh, max";

export interface ClaudeSelectModelRpcRequest {
  purpose: "set_model_selector_state";
  method: "PATCH";
  url: string;
  profile: string;
  body?: string;
  timeoutMs: number;
}

export interface ClaudeSelectModelRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
}

export type ClaudeSelectModelRpcFetch = (request: ClaudeSelectModelRpcRequest) => Promise<ClaudeSelectModelRpcFetchResult>;

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function claudeSelectModelRpcErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/thinking_not_available|thinking mode .*not available|model selection drift|model_selector_state/i.test(message)) return ConsumerErrorCodes.MODEL_SELECTION_DRIFT;
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
  if (status === 400 && /thinking_not_available|thinking mode .*not available|model_selector_state/i.test(body)) return ConsumerErrorCodes.MODEL_SELECTION_DRIFT;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.UNKNOWN;
}

function selectModelErrorOutput(error: any, selectedModel: string | null = null, selectedThinkingLevel: string | null = null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeSelectModelRpcErrorCode(error);
  return safeOutput({
    ok: false,
    selected_model: selectedModel,
    selected_thinking_level: selectedThinkingLevel,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

export function normalizeClaudeRpcModel(model: unknown): string {
  const value = String(model || "").trim();
  if (!value) return "";
  if (/^claude-/i.test(value)) return value;
  const normalized = value.toLowerCase().replace(/\s+/g, " ");
  const known: Record<string, string> = {
    "opus": "claude-opus-4-8",
    "opus 4.8": "claude-opus-4-8",
    "claude opus": "claude-opus-4-8",
    "claude opus 4.8": "claude-opus-4-8",
    "opus 4.7": "claude-opus-4-7",
    "claude opus 4.7": "claude-opus-4-7",
    "opus 4.6": "claude-opus-4-6",
    "claude opus 4.6": "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "sonnet 4": "claude-sonnet-4-6",
    "sonnet 4.6": "claude-sonnet-4-6",
    "claude sonnet": "claude-sonnet-4-6",
    "claude sonnet 4.6": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "haiku 4.5": "claude-haiku-4-5-20251001",
    "claude haiku": "claude-haiku-4-5-20251001",
    "claude haiku 4.5": "claude-haiku-4-5-20251001"
  };
  return known[normalized] || value;
}

function modelSelectorStatePath(orgId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/model_selector_state/chat`;
}

function validateArgs(args: any): WebAiToolError | null {
  if (!args?.profile || typeof args.profile !== "string") return new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_select_model requires profile");
  if (!args.model && !args.thinking_level) return new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_select_model requires at least one of: model, thinking_level");
  if (args.model !== undefined && (typeof args.model !== "string" || !args.model.trim())) return new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "model must be a non-empty picker label");
  if (args.thinking_level !== undefined && !THINKING_LEVELS.has(String(args.thinking_level))) return new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `unsupported thinking_level "${args.thinking_level}" (allowed: ${THINKING_LEVELS_LABEL})`);
  if (args.model !== undefined && args.thinking_level !== undefined) {
    const modelId = normalizeClaudeRpcModel(args.model);
    const thinkingLevel = String(args.thinking_level);
    if (/haiku/i.test(modelId) && CLAUDE_EFFORT_LEVELS.has(thinkingLevel)) {
      return new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `model ${modelId} does not support effort levels`);
    }
  }
  return null;
}

type ClaudeSelectorThinking =
  | { type: "effort_and_mode"; effort: string; mode: string }
  | { type: "mode"; mode: string };

function buildClaudeSelectorThinking(modelId: string, thinkingLevel: string): ClaudeSelectorThinking {
  const isEffort = CLAUDE_EFFORT_LEVELS.has(thinkingLevel);
  const isHaikuModeOnly = /haiku/i.test(modelId);
  if (isHaikuModeOnly) {
    if (isEffort) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `model ${modelId} does not support effort levels`);
    return { type: "mode", mode: thinkingLevel };
  }
  if (isEffort) return { type: "effort_and_mode", effort: thinkingLevel, mode: "off" };
  return { type: "effort_and_mode", effort: "high", mode: thinkingLevel };
}

export function buildClaudeSelectModelRpcRequests(args: any, orgId: string): ClaudeSelectModelRpcRequest[] {
  const invalid = validateArgs(args);
  if (invalid) throw invalid;
  const profile = String(args.profile || DEFAULT_CLAUDE_PROFILE);
  const timeoutMs = responseTimeoutMs(args);
  const modelId = args.model ? normalizeClaudeRpcModel(args.model) : "";
  const thinkingLevel = args.thinking_level ? String(args.thinking_level) : null;
  const body: Record<string, unknown> = {};
  if (modelId) body.model = modelId;
  if (thinkingLevel) body.thinking = buildClaudeSelectorThinking(modelId, thinkingLevel);
  return [{
    purpose: "set_model_selector_state",
    method: "PATCH",
    url: modelSelectorStatePath(orgId),
    profile,
    timeoutMs,
    body: JSON.stringify(body)
  }];
}

async function fetchClaudeSelectModelInPage(page: any, request: ClaudeSelectModelRpcRequest): Promise<ClaudeSelectModelRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, method, body, timeoutMs }: { url: string; method: string; body?: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal
      });
      const text = await response.text();
      return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text };
    } finally {
      clearTimeout(timer);
    }
  }, { url: request.url, method: request.method, body: request.body, timeoutMs: request.timeoutMs });
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
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cookieMatch = /(?:^|;\s*)lastActiveOrg=([^;]+)/.exec(document.cookie || "");
    if (cookieMatch?.[1]) {
      const cookieOrg = decodeURIComponent(cookieMatch[1]);
      if (uuidRe.test(cookieOrg)) return cookieOrg;
    }
    const findUuid = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === "string" && uuidRe.test(value)) return value;
      if (Array.isArray(value)) { for (const item of value) { const found = findUuid(item); if (found) return found; } return null; }
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of ["uuid", "id", "organization_uuid", "organizationUuid"]) { const found = findUuid(record[key]); if (found) return found; }
        for (const item of Object.values(record)) { const found = findUuid(item); if (found) return found; }
      }
      return null;
    };
    try {
      const response = await fetch("/api/bootstrap", { credentials: "include" });
      if (response.ok) {
        const bootstrap = await response.json();
        const memberships = (bootstrap as any)?.account?.memberships;
        if (Array.isArray(memberships)) {
          for (const membership of memberships) {
            const uuid = (membership as any)?.organization?.uuid;
            if (typeof uuid === "string" && uuidRe.test(uuid)) return uuid;
          }
        }
      }
    } catch {}
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

function parseClaudeSelectorState(text: string): { model?: string; thinkingLevel?: string } {
  try {
    const json = JSON.parse(text || "null");
    const model = typeof json?.model === "string" ? json.model : undefined;
    const effort = json?.thinking && typeof json.thinking.effort === "string" ? json.thinking.effort : undefined;
    const mode = json?.thinking && typeof json.thinking.mode === "string" ? json.thinking.mode : undefined;
    return { model, thinkingLevel: effort ?? mode };
  } catch {
    return {};
  }
}

export async function webAiClaudeSelectModelRpcWithFetch(
  args: any,
  fetchRpc: ClaudeSelectModelRpcFetch,
  options: { orgId?: string } = {}
): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}) };
  const requestedThinkingLevel = effective.thinking_level ? String(effective.thinking_level) : null;
  const requestedModel = effective.model ? normalizeClaudeRpcModel(effective.model) : null;
  let httpStatus: number | null = null;
  try {
    const invalid = validateArgs(effective);
    if (invalid) throw invalid;
    const orgId = options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId;
    if (!orgId || !UUID_RE.test(String(orgId))) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC select_model");
    const requests = buildClaudeSelectModelRpcRequests(effective, String(orgId));
    let selectedModel = requestedModel;
    let selectedThinkingLevel = requestedThinkingLevel;
    for (const request of requests) {
      const response = await fetchRpc(request);
      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        throw new WebAiToolError(httpStatusErrorCode(response.status, response.text || ""), `Claude select_model RPC ${request.purpose} returned HTTP ${response.status}`);
      }
      const state = parseClaudeSelectorState(response.text || "");
      if (state.model) selectedModel = state.model;
      if (state.thinkingLevel) selectedThinkingLevel = state.thinkingLevel;
    }
    return safeOutput({ ok: true, selected_model: selectedModel, selected_thinking_level: selectedThinkingLevel, errorCode: null, http_status: httpStatus });
  } catch (error: any) {
    return selectModelErrorOutput(error, requestedModel, requestedThinkingLevel, { http_status: httpStatus });
  }
}

export async function webAiClaudeSelectModelRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}) };
  let lease: string | undefined;
  let browser: any;
  try {
    const invalid = validateArgs(effective);
    if (invalid) throw invalid;
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      return selectModelErrorOutput(new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before model selection"));
    }
    const orgId = await activeClaudeOrgId(page, effective);
    return await webAiClaudeSelectModelRpcWithFetch({ ...effective, organization_id: orgId }, (request) => fetchClaudeSelectModelInPage(page, request), { orgId });
  } catch (error: any) {
    return selectModelErrorOutput(error, effective.model ? String(effective.model).trim() : null, effective.thinking_level ? String(effective.thinking_level) : null);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
