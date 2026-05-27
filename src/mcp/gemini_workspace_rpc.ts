const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  loginRequiredForService,
  releaseProfileLease,
  safeOutput,
  WebAiToolError
} from "./tools";

function createDefaultManagedBrowserLauncher(): ManagedBrowserLauncherLike {
  return require("../runtime/pool/profilePool").createManagedBrowserLauncher();
}

interface ManagedBrowserLauncherLike {
  launch(options?: { profile?: string; url?: string; cdpPort?: number }): Promise<{ connected: boolean; cdpEndpoint: string; lastError?: string }>;
}

export interface GeminiBatchRpcPayloadTemplate {
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

export interface GeminiBatchRpcSnapshot {
  at: string;
  bl: string;
  fsid: string;
  cookieHeader: string;
  userAgent: string;
  pageUrl: string;
}

export interface GeminiBatchRpcRequest {
  tool: string;
  variant: string;
  purpose: string;
  rpcId: string;
  url: string;
  method: "POST";
  profile: string;
  timeoutMs: number;
  headers: Record<string, string>;
  body: string;
}

export interface GeminiBatchRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  headers?: Record<string, string>;
  url?: string;
  elapsedMs?: number;
}

export type GeminiBatchRpcFetch = (request: GeminiBatchRpcRequest) => Promise<GeminiBatchRpcFetchResult>;

export interface GeminiBatchRpcDecodedResponse {
  ok: boolean;
  chunks: unknown[];
  rpcIds: string[];
  eventTypes: string[];
}

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CDP_PORT = 9225;
const GEMINI_HOST = "gemini.google.com";
const GEMINI_CHAT_URL = "https://gemini.google.com/app";
const CAPTURE_ROOTS = [
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-b3-workspace-model-conversation", "fixtures"),
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-a-captures")
];

export class GeminiBatchRpcToolError extends Error {
  errorCode: ConsumerErrorCode;
  evidence?: Record<string, unknown>;
  constructor(errorCode: ConsumerErrorCode, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

type GeminiWorkspaceSurface = "gems" | "scheduled" | "study" | "workspace_integration" | "connected_apps" | "personalization" | "audio_overview";

type WorkspaceSurfaceConfig = {
  variant: string;
  route: string;
  summary: string;
  rpcAvailable: boolean;
};

const WORKSPACE_SURFACES: Record<GeminiWorkspaceSurface, WorkspaceSurfaceConfig> = {
  gems: {
    variant: "surface_gems",
    route: "https://gemini.google.com/gems/view",
    summary: "Gem manager route opened (RPC verified)",
    rpcAvailable: true
  },
  scheduled: {
    variant: "surface_scheduled",
    route: "https://gemini.google.com/scheduled",
    summary: "Scheduled actions manager route opened (RPC verified)",
    rpcAvailable: true
  },
  study: {
    variant: "surface_study",
    route: GEMINI_CHAT_URL,
    summary: "Guided learning tool is visible (observe-only)",
    rpcAvailable: true
  },
  workspace_integration: {
    variant: "surface_workspace_integration",
    route: "https://gemini.google.com/apps",
    summary: "Google Workspace integration route opened (observe-only)",
    rpcAvailable: true
  },
  connected_apps: {
    variant: "surface_connected_apps",
    route: "https://gemini.google.com/apps",
    summary: "Connected apps route opened (observe-only)",
    rpcAvailable: true
  },
  personalization: {
    variant: "surface_personalization",
    route: "https://gemini.google.com/personalization-settings",
    summary: "Personalization settings route opened (observe-only; memory toggle mutations require POLICY_APPROVAL_REQUIRED)",
    rpcAvailable: true
  },
  audio_overview: {
    variant: "surface_audio_overview",
    route: "https://notebooklm.google.com/",
    summary: "NotebookLM Audio Overview has no verified Gemini RPC capture",
    rpcAvailable: false
  }
};

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

export function geminiBatchRpcErrorCode(error: any): ConsumerErrorCode {
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/RPC_NOT_AVAILABLE|unsupported|invalid args/i.test(message)) return ConsumerErrorCodes.INVALID_ARGS;
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|quota|overage|lockout/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No Gemini CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

export function geminiBatchHttpErrorCode(status: number, body = ""): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage|lockout/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? args?.response_timeout_ms ?? args?.responseTimeoutMs ?? 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function pageLooksLogin(url: string): boolean {
  return /accounts\.google\.com|signin/i.test(url || "");
}

function endpointOrigin(endpoint: string): string {
  const parsed = new URL(endpoint);
  return `${parsed.protocol}//${parsed.host}`;
}

function normalizeUrlLikeTarget(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) return `https://${value}`;
  return undefined;
}

function requestedTabMatches(pageUrl: string, requested?: string): boolean {
  if (!requested || !pageUrl) return false;
  if (pageUrl.includes(requested)) return true;
  const normalized = normalizeUrlLikeTarget(requested);
  return Boolean(normalized && pageUrl.includes(normalized));
}

export function normalizeGeminiWorkspaceSurface(surface: unknown): GeminiWorkspaceSurface | null {
  const value = String(surface || "").trim().toLowerCase();
  if (value === "gems" || value === "scheduled" || value === "study" || value === "workspace_integration" || value === "connected_apps" || value === "personalization" || value === "audio_overview") return value;
  return null;
}

export function geminiWorkspaceRoute(surface: unknown): string {
  const normalized = normalizeGeminiWorkspaceSurface(surface);
  return normalized ? WORKSPACE_SURFACES[normalized].route : GEMINI_CHAT_URL;
}

export function targetUrlForGeminiBatchRpc(args: any, fallback = GEMINI_CHAT_URL): string {
  const value = String(args?.url || args?.tab_url_contains || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return `https://gemini.google.com/app/${value}`;
  return fallback;
}

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${url}`);
  return await response.json() as T;
}

async function ensureGeminiPage(endpoint: string, args: any, fallbackUrl: string): Promise<any> {
  const listUrl = `${endpointOrigin(endpoint)}/json/list`;
  let pages = await fetchJson<any[]>(listUrl);
  const requested = String(args?.url || args?.tab_url_contains || "").trim();
  let page = requested
    ? pages.find((candidate) => candidate.type === "page" && requestedTabMatches(String(candidate.url || ""), requested) && !pageLooksLogin(String(candidate.url || "")))
    : null;
  if (!page) {
    page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
  }
  if (page) return page;
  await fetch(`${endpointOrigin(endpoint)}/json/new?${encodeURIComponent(fallbackUrl)}`, { method: "PUT" }).catch(() => undefined);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    pages = await fetchJson<any[]>(listUrl).catch(() => []);
    page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const login = pages.find((candidate) => candidate.type === "page" && pageLooksLogin(String(candidate.url || "")));
  if (login) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC batch call");
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "No Gemini CDP page was available for RPC token capture");
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
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${command.method} timed out`));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
      });
    }));
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    ws.close();
  }
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

export async function captureGeminiBatchRpcSnapshot(args: any, runtime?: BrowserToolRuntime, fallbackUrl = GEMINI_CHAT_URL): Promise<GeminiBatchRpcSnapshot> {
  if (args?.__cdpSnapshot) return args.__cdpSnapshot as GeminiBatchRpcSnapshot;
  const profile = args?.profile || GEMINI_PROFILE;
  const launcher: ManagedBrowserLauncherLike = runtime?.launcher || createDefaultManagedBrowserLauncher();
  const status = await launcher.launch({ profile, url: targetUrlForGeminiBatchRpc(args, fallbackUrl), cdpPort: args?.cdpPort || GEMINI_CDP_PORT });
  if (!status.connected) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, status.lastError || `CDP endpoint is not connected for profile ${profile}`);
  const page = await ensureGeminiPage(status.cdpEndpoint, args, fallbackUrl);
  const wsUrl = page.webSocketDebuggerUrl;
  if (!wsUrl) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "Gemini CDP page did not expose a websocket debugger URL");
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
  if (pageLooksLogin(pageUrl) || loginRequiredForService("gemini", pageUrl)) {
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC batch call");
  }
  const at = String(value.at || "");
  const bl = String(value.bl || "");
  const fsid = String(value.fsid || "");
  if (!at || !bl || !fsid) {
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC token capture did not find at/bl/f.sid on the logged-in page");
  }
  const cookieHeader = cookieHeaderForHost(cookieResult?.cookies || [], GEMINI_HOST);
  if (!cookieHeader) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC cookie jar was empty");
  return { at, bl, fsid, cookieHeader, userAgent: String(value.ua || "Mozilla/5.0"), pageUrl };
}

export function loadGeminiBatchRpcPayloadTemplate(args: any = {}, toolVariant: string): GeminiBatchRpcPayloadTemplate {
  if (args.__payloadTemplate) return args.__payloadTemplate as GeminiBatchRpcPayloadTemplate;
  const candidates = [
    args?.__payloadTemplatePath,
    ...CAPTURE_ROOTS.map((root) => path.join(root, toolVariant, "payload-template.json"))
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return JSON.parse(fs.readFileSync(candidate, "utf8")); } catch { /* try next capture */ }
  }
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini RPC payload template was not found for ${toolVariant}`);
}

export function normalizeGeminiBatchFReq(template: GeminiBatchRpcPayloadTemplate): unknown[] {
  const top = template.f_req_template;
  if (!Array.isArray(top) || !top.length) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC payload template is missing f_req_template");
  return cloneJson(top);
}

function templateRpcId(template: GeminiBatchRpcPayloadTemplate): string {
  const explicit = String(template.rpc_id || "").trim();
  if (explicit) return explicit;
  const top = template.f_req_template;
  const nested = Array.isArray(top) ? top[0] : null;
  const first = Array.isArray(nested) ? nested[0] : null;
  const rpcId = Array.isArray(first) ? String(first[0] || "") : "";
  if (rpcId) return rpcId;
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC payload template is missing rpc_id");
}

function buildBatchEndpoint(template: GeminiBatchRpcPayloadTemplate, snapshot: GeminiBatchRpcSnapshot, args: any = {}): string {
  const endpoint = String(template.endpoint || "");
  if (!endpoint) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC payload template is missing endpoint");
  const url = new URL(endpoint);
  url.searchParams.set("bl", snapshot.bl);
  url.searchParams.set("f.sid", snapshot.fsid);
  url.searchParams.set("hl", "en");
  const reqid = Number.isFinite(Number(args?.__reqid)) ? Number(args.__reqid) : Math.floor(100000 + (Date.now() % 9000000));
  url.searchParams.set("_reqid", String(reqid));
  url.searchParams.set("rt", "c");
  return url.toString();
}

function copiedTemplateHeaders(template: GeminiBatchRpcPayloadTemplate, snapshot: GeminiBatchRpcSnapshot): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "*/*",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: "https://gemini.google.com",
    referer: "https://gemini.google.com/",
    "x-same-domain": "1",
    "user-agent": snapshot.userAgent,
    cookie: snapshot.cookieHeader
  };
  const source = template.headers_template || {};
  for (const key of ["x-goog-ext-525001261-jspb", "x-goog-ext-73010989-jspb", "x-browser-channel", "x-browser-year", "x-client-data"]) {
    const value = source[key];
    if (typeof value === "string" && value && !/\[REDACTED/i.test(value)) headers[key] = value;
  }
  return headers;
}

export function buildGeminiBatchRpcRequest(args: any, snapshot: GeminiBatchRpcSnapshot, template: GeminiBatchRpcPayloadTemplate, meta: { tool: string; variant: string; purpose?: string }): GeminiBatchRpcRequest {
  const form = new URLSearchParams();
  form.set("f.req", JSON.stringify(normalizeGeminiBatchFReq(template)));
  form.set("at", snapshot.at);
  return {
    tool: meta.tool,
    variant: meta.variant,
    purpose: meta.purpose || meta.variant,
    rpcId: templateRpcId(template),
    url: buildBatchEndpoint(template, snapshot, args),
    method: "POST",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: responseTimeoutMs(args),
    headers: copiedTemplateHeaders(template, snapshot),
    body: form.toString()
  };
}

function parseGeminiBatchPayloadLines(streamText: string): unknown[] {
  const chunks: unknown[] = [];
  for (const line of String(streamText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    try { chunks.push(JSON.parse(trimmed)); }
    catch (error) { throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_JSON, `Gemini batch RPC response chunk was not valid JSON: ${errorMessageFromUnknown(error, "parse error")}`); }
  }
  if (!chunks.length) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini batch RPC response did not contain length-prefixed JSON chunks");
  return chunks;
}

function collectBatchEvents(value: unknown, eventTypes: string[], rpcIds: string[]): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "string") {
    eventTypes.push(value[0]);
    if (value[0] === "wrb.fr" && typeof value[1] === "string") rpcIds.push(value[1]);
  }
  for (const item of value) if (Array.isArray(item)) collectBatchEvents(item, eventTypes, rpcIds);
}

export function decodeGeminiBatchRpcResponse(streamText: string): GeminiBatchRpcDecodedResponse {
  const chunks = parseGeminiBatchPayloadLines(streamText);
  const eventTypes: string[] = [];
  const rpcIds: string[] = [];
  for (const chunk of chunks) collectBatchEvents(chunk, eventTypes, rpcIds);
  return { ok: rpcIds.length > 0 || eventTypes.includes("e"), chunks, rpcIds, eventTypes };
}

export async function runGeminiBatchRpcRequest(fetchRpc: GeminiBatchRpcFetch, request: GeminiBatchRpcRequest): Promise<{ response: GeminiBatchRpcFetchResult; decoded: GeminiBatchRpcDecodedResponse }> {
  const response = await fetchRpc(request);
  if (response.status < 200 || response.status >= 300) {
    throw new GeminiBatchRpcToolError(geminiBatchHttpErrorCode(response.status, response.text || ""), `${request.tool} ${request.variant} returned HTTP ${response.status}`);
  }
  const decoded = decodeGeminiBatchRpcResponse(response.text);
  if (!decoded.ok || !decoded.rpcIds.includes(request.rpcId)) {
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_JSON, `${request.tool} ${request.variant} response did not acknowledge rpc_id ${request.rpcId}`);
  }
  return { response, decoded };
}

export async function defaultGeminiBatchRpcFetch(request: GeminiBatchRpcRequest): Promise<GeminiBatchRpcFetchResult> {
  const started = Date.now();
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(Math.min(request.timeoutMs || 60000, 180000))
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  return {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    text: await response.text(),
    headers,
    url: response.url,
    elapsedMs: Date.now() - started
  };
}

function workspaceErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const surface = String(args?.surface || "");
  const normalized = normalizeGeminiWorkspaceSurface(surface);
  const errorCode = geminiBatchRpcErrorCode(error);
  return safeOutput({
    ok: false,
    surface,
    url: normalized ? WORKSPACE_SURFACES[normalized].route : GEMINI_CHAT_URL,
    summary: "",
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

export async function webAiGeminiWorkspaceRpcWithFetch(args: any, fetchRpc: GeminiBatchRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  try {
    const surface = normalizeGeminiWorkspaceSurface(effective.surface);
    if (!surface) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_workspace unsupported surface: ${String(effective.surface)}`);
    const config = WORKSPACE_SURFACES[surface];
    if (!config.rpcAvailable) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini workspace surface ${surface} is RPC_NOT_AVAILABLE from Wave A captures`);
    const snapshot = effective.__cdpSnapshot as GeminiBatchRpcSnapshot;
    if (!snapshot) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webAiGeminiWorkspaceRpcWithFetch requires args.__cdpSnapshot");
    const template = loadGeminiBatchRpcPayloadTemplate(effective, `webai_gemini_workspace--${config.variant}`);
    const request = buildGeminiBatchRpcRequest(effective, snapshot, template, { tool: "webai_gemini_workspace", variant: config.variant, purpose: surface });
    const { response, decoded } = await runGeminiBatchRpcRequest(fetchRpc, request);
    return safeOutput({
      surface,
      url: config.route,
      summary: config.summary,
      errorCode: null,
      http_status: response.status,
      elapsed_ms: nowMs(effective) - started,
      rpc_id: request.rpcId,
      rpc_ack: decoded.rpcIds.includes(request.rpcId)
    });
  } catch (error: any) {
    return workspaceErrorOutput(effective, error, { elapsed_ms: nowMs(effective) - started });
  }
}

export async function webAiGeminiWorkspaceRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const surface = normalizeGeminiWorkspaceSurface(effective.surface);
  const fallbackUrl = surface ? WORKSPACE_SURFACES[surface].route : GEMINI_CHAT_URL;
  const lease = acquireProfileLease(effective.profile);
  try {
    const snapshot = await captureGeminiBatchRpcSnapshot(effective, runtime, fallbackUrl);
    return await webAiGeminiWorkspaceRpcWithFetch({ ...effective, __cdpSnapshot: snapshot }, effective.__fetch || defaultGeminiBatchRpcFetch);
  } catch (error: any) {
    return workspaceErrorOutput(effective, error);
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}

export const inspectGeminiWorkspaceRpc = webAiGeminiWorkspaceRpc;
