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

export interface ClaudeWorkspaceRpcRequest {
  surface: string;
  purpose: "capture_probe" | "surface_read";
  method: "GET";
  url: string;
  profile: string;
  timeoutMs: number;
}

export interface ClaudeWorkspaceRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
}

export type ClaudeWorkspaceRpcFetch = (request: ClaudeWorkspaceRpcRequest) => Promise<ClaudeWorkspaceRpcFetchResult>;

type WorkspaceSurface = "projects" | "integrations" | "skills" | "appearance" | "style_presets";

interface WorkspaceSurfaceConfig {
  route: string;
  readPath: (orgId: string) => string;
  summary: (json: unknown, response: ClaudeWorkspaceRpcFetchResult) => string;
}

const WORKSPACE_SURFACES: Record<WorkspaceSurface, WorkspaceSurfaceConfig> = {
  projects: {
    route: "https://claude.ai/projects",
    readPath: (orgId) => `/api/organizations/${encodeURIComponent(orgId)}/projects_v2?limit=30&offset=0&filter=is_creator&order_by=latest_activity&searchQuery=&is_archived=false`,
    summary: (json) => {
      const count = countArrayLike(json, ["projects", "items", "data"]);
      return count > 0 ? `${count} project(s) visible` : "Projects route opened";
    }
  },
  integrations: {
    route: CLAUDE_FRESH_URL,
    readPath: (orgId) => `/api/organizations/${encodeURIComponent(orgId)}/sync/settings`,
    summary: (json) => {
      const count = Array.isArray(json) ? json.length : countArrayLike(json, ["settings", "items", "data"]);
      return count > 0 ? `${count} integration setting(s) visible` : "integrations list opened";
    }
  },
  skills: {
    route: CLAUDE_FRESH_URL,
    readPath: (orgId) => `/api/organizations/${encodeURIComponent(orgId)}/skills/list-skills`,
    summary: (json) => {
      const count = countArrayLike(json, ["skills", "items", "data"]);
      return count > 0 ? `${count} skill(s) visible` : "skills list opened";
    }
  },
  appearance: {
    route: "https://claude.ai/customize",
    readPath: (orgId) => `/api/organizations/${encodeURIComponent(orgId)}/experiences/claude_web?locale=en-US`,
    summary: () => "Customize/appearance surface visible"
  },
  style_presets: {
    route: CLAUDE_FRESH_URL,
    readPath: (orgId) => `/api/organizations/${encodeURIComponent(orgId)}/list_styles`,
    summary: (json) => {
      const count = countArrayLike(json, ["styles", "items", "data"]);
      return count > 0 ? `${count} style preset(s) visible` : "style_presets list opened";
    }
  }
};

function countArrayLike(value: unknown, keys: string[]): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested.length;
  }
  return 0;
}

function parseJsonMaybe(text: string): unknown {
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function errorMessageFromUnknown(error: any, fallback: string): string {
  if (!error) return fallback;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  if (typeof error === "string" && error.trim()) return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function claudeWorkspaceRpcErrorCode(error: any): ConsumerErrorCode {
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

function workspaceRpcErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeWorkspaceRpcErrorCode(error);
  return safeOutput({
    ok: false,
    surface: String(args?.surface || ""),
    url: WORKSPACE_SURFACES[normalizeSurface(args?.surface) || "integrations"].route,
    summary: "",
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function normalizeSurface(surface: unknown): WorkspaceSurface | null {
  const value = String(surface || "").trim().toLowerCase();
  if (value === "projects" || value === "integrations" || value === "skills" || value === "appearance" || value === "style_presets") return value;
  return null;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function syncSettingsPath(orgId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/sync/settings`;
}

export function buildClaudeWorkspaceRpcRequests(args: any, orgId: string): ClaudeWorkspaceRpcRequest[] {
  const surface = normalizeSurface(args?.surface);
  if (!surface) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_claude_workspace unsupported surface: ${String(args?.surface)}`);
  const profile = String(args?.profile || DEFAULT_CLAUDE_PROFILE);
  const timeoutMs = responseTimeoutMs(args);
  const config = WORKSPACE_SURFACES[surface];
  const probePath = syncSettingsPath(orgId);
  const readPath = config.readPath(orgId);
  const requests: ClaudeWorkspaceRpcRequest[] = [{ surface, purpose: "capture_probe", method: "GET", url: probePath, profile, timeoutMs }];
  if (readPath !== probePath) requests.push({ surface, purpose: "surface_read", method: "GET", url: readPath, profile, timeoutMs });
  return requests;
}

async function fetchClaudeWorkspaceInPage(page: any, request: ClaudeWorkspaceRpcRequest): Promise<ClaudeWorkspaceRpcFetchResult> {
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
    } catch {
      return null;
    }
  });
  if (typeof orgId === "string" && UUID_RE.test(orgId)) return orgId;
  throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization could not be resolved from the logged-in browser context");
}

export async function webAiClaudeWorkspaceRpcWithFetch(
  args: any,
  fetchRpc: ClaudeWorkspaceRpcFetch,
  options: { orgId?: string } = {}
): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const surface = normalizeSurface(effective.surface);
  if (!surface) return workspaceRpcErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_claude_workspace unsupported surface: ${String(effective.surface)}`));
  const config = WORKSPACE_SURFACES[surface];
  let httpStatus: number | null = null;
  try {
    const orgId = options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId;
    if (!orgId || !UUID_RE.test(String(orgId))) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC workspace");
    const requests = buildClaudeWorkspaceRpcRequests(effective, String(orgId));
    let selectedResponse: ClaudeWorkspaceRpcFetchResult | null = null;
    for (const request of requests) {
      const response = await fetchRpc(request);
      httpStatus = response.status;
      if (response.status < 200 || response.status >= 300) {
        throw new WebAiToolError(httpStatusErrorCode(response.status, response.text || ""), `Claude workspace RPC ${request.purpose} returned HTTP ${response.status}`);
      }
      selectedResponse = response;
    }
    const json = parseJsonMaybe(selectedResponse?.text || "");
    return safeOutput({ surface, url: config.route, summary: config.summary(json, selectedResponse!), errorCode: null, http_status: httpStatus });
  } catch (error: any) {
    return workspaceRpcErrorOutput(effective, error, { http_status: httpStatus });
  }
}

export async function webAiClaudeWorkspaceRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      return workspaceRpcErrorOutput(effective, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before workspace RPC"), { url: String(page.url?.() || CLAUDE_FRESH_URL) });
    }
    const orgId = await activeClaudeOrgId(page, effective);
    return await webAiClaudeWorkspaceRpcWithFetch({ ...effective, organization_id: orgId }, (request) => fetchClaudeWorkspaceInPage(page, request), { orgId });
  } catch (error: any) {
    return workspaceRpcErrorOutput(effective, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
