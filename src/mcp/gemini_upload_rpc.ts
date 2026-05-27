const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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
import { decodeGeminiStream } from "./gemini_send_prompt_rpc";

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
const GEMINI_UPLOAD_ENDPOINT = "https://push.clients6.google.com/upload/";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 60000;
const CAPTURE_ROOTS = [
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-b2-upload-media", "fixtures"),
  path.join(process.cwd(), ".runs", "path-c-gemini-rpc", "wave-a-captures")
];

export interface GeminiRpcPayloadTemplate {
  f_req_template?: unknown[];
  endpoint?: string;
  headers_template?: Record<string, string>;
}

export interface GeminiRpcCdpSnapshot {
  at: string;
  bl: string;
  fsid: string;
  cookieHeader: string;
  cookies?: any[];
  userAgent: string;
  pageUrl: string;
  conversationTuple?: unknown[];
}

export interface GeminiUploadRpcFile {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
  textContent: string | null;
}

export interface GeminiUploadRecord {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
}

export interface GeminiUploadRpcRequest {
  kind: "upload-start" | "upload-finalize" | "completion";
  url: string;
  method: "POST";
  profile: string;
  timeoutMs: number;
  headers: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  file?: GeminiUploadRpcFile;
  uploadUrl?: string;
}

export interface GeminiUploadRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  headers?: Record<string, string>;
  url?: string;
  elapsedMs?: number;
}

export type GeminiUploadRpcFetch = (request: GeminiUploadRpcRequest) => Promise<GeminiUploadRpcFetchResult>;

class GeminiUploadRpcToolError extends Error {
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

function normalizeUrlLikeTarget(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) return `https://${value}`;
  return undefined;
}

export function targetUrlForGeminiRpc(args: any): string {
  const value = String(args?.url || args?.tab_url_contains || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return `https://gemini.google.com/app/${value}`;
  return GEMINI_CHAT_URL;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function uploadTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_UPLOAD_TIMEOUT_MS;
}

function pageLooksLogin(url: string): boolean {
  return /accounts\.google\.com|signin/i.test(url || "");
}

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${url}`);
  return await response.json() as T;
}

function endpointOrigin(endpoint: string): string {
  const parsed = new URL(endpoint);
  return `${parsed.protocol}//${parsed.host}`;
}

function requestedTabMatches(pageUrl: string, requested?: string): boolean {
  if (!requested || !pageUrl) return false;
  if (pageUrl.includes(requested)) return true;
  const normalized = normalizeUrlLikeTarget(requested);
  return Boolean(normalized && pageUrl.includes(normalized));
}

async function ensureGeminiPage(endpoint: string, args: any): Promise<any> {
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
  await fetch(`${endpointOrigin(endpoint)}/json/new?${encodeURIComponent(targetUrlForGeminiRpc(args))}`, { method: "PUT" }).catch(() => undefined);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    pages = await fetchJson<any[]>(listUrl).catch(() => []);
    page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const login = pages.find((candidate) => candidate.type === "page" && pageLooksLogin(String(candidate.url || "")));
  if (login) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC upload");
  throw new GeminiUploadRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "No Gemini CDP page was available for RPC token capture");
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

function normalizeConversationTuple(value: unknown): unknown[] | null {
  if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" && typeof value[2] === "string") {
    const tuple = value.slice(0, 10);
    while (tuple.length < 10) tuple.push(null);
    if (tuple[9] === null || tuple[9] === undefined) tuple[9] = "";
    return tuple;
  }
  return null;
}

async function captureGeminiCdpSnapshot(args: any, runtime?: BrowserToolRuntime): Promise<GeminiRpcCdpSnapshot> {
  if (args?.__cdpSnapshot) return args.__cdpSnapshot as GeminiRpcCdpSnapshot;
  const profile = args?.profile || GEMINI_PROFILE;
  const launcher: ManagedBrowserLauncherLike = runtime?.launcher || createDefaultManagedBrowserLauncher();
  const status = await launcher.launch({ profile, url: targetUrlForGeminiRpc(args), cdpPort: args?.cdpPort || GEMINI_CDP_PORT });
  if (!status.connected) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, status.lastError || `CDP endpoint is not connected for profile ${profile}`);
  const page = await ensureGeminiPage(status.cdpEndpoint, args);
  const wsUrl = page.webSocketDebuggerUrl;
  if (!wsUrl) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "Gemini CDP page did not expose a websocket debugger URL");
  const [evalResult, cookieResult] = await cdpBatch(wsUrl, [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `(() => { const html = String(document.documentElement?.innerHTML || ""); const pick = (re) => (html.match(re) || [])[0] || ""; const c = pick(/c_[a-f0-9]{8,}/i); const r = pick(/r_[a-f0-9]{8,}/i); const rc = pick(/rc_[a-f0-9]{8,}/i); const context = pick(/Aw[A-Za-z0-9_-]{20,}/); return { at: window.WIZ_global_data?.SNlM0e || html.match(/AOOh0P[^\\"&<\\s]+/)?.[0] || "", bl: window.WIZ_global_data?.cfb2h || html.match(/boq_assistant-bard-web-server_[^\\"'&<\\\\]+/)?.[0] || "", fsid: String(window.WIZ_global_data?.FdrFJe || ""), href: location.href, ua: navigator.userAgent, conversationTuple: c && r && rc ? [c, r, rc, null, null, null, null, null, null, context] : null }; })()`,
        returnByValue: true,
        awaitPromise: true
      }
    },
    { method: "Network.getAllCookies" }
  ]);
  const value = evalResult?.result?.value || {};
  const pageUrl = String(value.href || page.url || GEMINI_CHAT_URL);
  if (pageLooksLogin(pageUrl) || loginRequiredForService("gemini", pageUrl)) {
    throw new GeminiUploadRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC upload");
  }
  const at = String(value.at || "");
  const bl = String(value.bl || "");
  const fsid = String(value.fsid || "");
  if (!at || !bl || !fsid) {
    throw new GeminiUploadRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC token capture did not find at/bl/f.sid on the logged-in page");
  }
  const cookieHeader = cookieHeaderForHost(cookieResult?.cookies || [], GEMINI_HOST);
  if (!cookieHeader) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC cookie jar was empty");
  return {
    at,
    bl,
    fsid,
    cookieHeader,
    userAgent: String(value.ua || "Mozilla/5.0"),
    pageUrl,
    conversationTuple: normalizeConversationTuple(value.conversationTuple) || undefined
  };
}

export function loadGeminiRpcPayloadTemplate(args: any = {}, toolVariant = "webai_gemini_upload_and_query--upload_and_query"): GeminiRpcPayloadTemplate {
  if (args.__payloadTemplate) return args.__payloadTemplate as GeminiRpcPayloadTemplate;
  const candidates = [
    args?.__payloadTemplatePath,
    ...CAPTURE_ROOTS.map((root) => path.join(root, toolVariant, "payload-template.json"))
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return JSON.parse(fs.readFileSync(candidate, "utf8")); } catch { /* try next capture */ }
  }
  throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `Gemini RPC payload template was not found for ${toolVariant}`);
}

export function normalizeGeminiFReqInner(template: GeminiRpcPayloadTemplate): unknown[] {
  const top = template.f_req_template;
  if (!Array.isArray(top) || top.length < 2) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC payload template is missing f_req_template");
  if (Array.isArray(top[1])) return cloneJson(top[1] as unknown[]);
  if (typeof top[1] === "string") {
    const parsed = JSON.parse(top[1]);
    if (Array.isArray(parsed)) return parsed;
  }
  throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC f_req_template has an unsupported shape");
}

function uuidUpper(): string {
  return crypto.randomUUID().toUpperCase();
}

function randomHex32(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildGeminiStreamGenerateFReq(prompt: string, template: GeminiRpcPayloadTemplate, args: any = {}): string {
  const inner = normalizeGeminiFReqInner(template);
  if (!Array.isArray(inner[0])) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC f.req prompt slot is missing");
  (inner[0] as unknown[])[0] = prompt;
  if (args.__attachments) (inner[0] as unknown[])[3] = args.__attachments;
  if (typeof inner[4] === "string") inner[4] = randomHex32();
  if (typeof inner[59] === "string") inner[59] = uuidUpper();
  return JSON.stringify([null, JSON.stringify(inner)]);
}

export function buildGeminiStreamGenerateEndpoint(snapshot: GeminiRpcCdpSnapshot, args: any = {}): string {
  const reqid = Number.isFinite(Number(args?.__reqid)) ? Number(args.__reqid) : Math.floor(100000 + (Date.now() % 9000000));
  const url = new URL("https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate");
  url.searchParams.set("bl", snapshot.bl);
  url.searchParams.set("f.sid", snapshot.fsid);
  url.searchParams.set("hl", "en");
  url.searchParams.set("_reqid", String(reqid));
  url.searchParams.set("rt", "c");
  return url.toString();
}

export function buildGeminiStreamGenerateRequest(args: any, snapshot: GeminiRpcCdpSnapshot, template: GeminiRpcPayloadTemplate, attachments?: unknown[]): GeminiUploadRpcRequest {
  const prompt = String(args?.prompt || "");
  if (!prompt.trim()) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC StreamGenerate requires prompt");
  const form = new URLSearchParams();
  form.set("f.req", buildGeminiStreamGenerateFReq(prompt, template, { ...args, __attachments: attachments }));
  form.set("at", snapshot.at);
  return {
    kind: "completion",
    url: buildGeminiStreamGenerateEndpoint(snapshot, args),
    method: "POST",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: responseTimeoutMs(args),
    body: form.toString(),
    headers: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "x-same-domain": "1",
      "user-agent": snapshot.userAgent,
      cookie: snapshot.cookieHeader
    }
  };
}

function mimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExt: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".html": "text/html",
    ".htm": "text/html",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  return mimeByExt[ext] || "application/octet-stream";
}

function readTextIfSmallText(filePath: string, mimeType: string, bytes: any): string | null {
  if (!/^text\//.test(mimeType) && !/\/(json|xml)$/.test(mimeType)) return null;
  if (bytes.length > 256 * 1024) return null;
  return bytes.toString("utf8");
}

function prepareUploadFiles(args: any): GeminiUploadRpcFile[] {
  const files = Array.isArray(args?.files) ? args.files : [];
  if (!files.length) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_upload_and_query requires at least one file");
  const missing = files.map((file: string) => path.resolve(String(file))).filter((file: string) => !fs.existsSync(file));
  if (missing.length) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file(s) not found: ${missing.join(", ")}`);
  return files.map((file: string) => {
    const resolved = path.resolve(String(file));
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `upload path is not a file: ${resolved}`);
    const bytes = fs.readFileSync(resolved);
    const mimeType = mimeTypeForFile(resolved);
    return {
      path: resolved,
      fileName: path.basename(resolved),
      mimeType,
      sizeBytes: bytes.length,
      base64: bytes.toString("base64"),
      textContent: readTextIfSmallText(resolved, mimeType, bytes)
    };
  });
}

export function buildGeminiUploadStartRequest(file: GeminiUploadRpcFile, args: any, snapshot: GeminiRpcCdpSnapshot): GeminiUploadRpcRequest {
  const body = `File name: ${file.fileName}`;
  return {
    kind: "upload-start",
    url: GEMINI_UPLOAD_ENDPOINT,
    method: "POST",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: uploadTimeoutMs(args),
    file,
    body,
    headers: {
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "push-id": "feeds/mcudyrk2a4khkz",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(file.sizeBytes),
      "x-goog-upload-protocol": "resumable",
      "x-tenant-id": "bard-storage",
      "user-agent": snapshot.userAgent,
      cookie: snapshot.cookieHeader
    }
  };
}

export function buildGeminiUploadFinalizeRequest(file: GeminiUploadRpcFile, uploadUrl: string, args: any, snapshot: GeminiRpcCdpSnapshot): GeminiUploadRpcRequest {
  return {
    kind: "upload-finalize",
    url: uploadUrl,
    method: "POST",
    profile: args?.profile || GEMINI_PROFILE,
    timeoutMs: uploadTimeoutMs(args),
    file,
    uploadUrl,
    bodyBase64: file.base64,
    headers: {
      accept: "*/*",
      "content-type": file.mimeType || "application/octet-stream",
      origin: "https://gemini.google.com",
      referer: "https://gemini.google.com/",
      "x-goog-upload-command": "upload, finalize",
      "x-goog-upload-offset": "0",
      "x-tenant-id": "bard-storage",
      "user-agent": snapshot.userAgent,
      cookie: snapshot.cookieHeader
    }
  };
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return found ? headers[found] : undefined;
}

function httpErrorCode(status: number, body = ""): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|overage|lockout/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
}

async function runFetchRequest(fetchRpc: GeminiUploadRpcFetch, request: GeminiUploadRpcRequest): Promise<GeminiUploadRpcFetchResult> {
  const response = await fetchRpc(request);
  if (response.status < 200 || response.status >= 300) {
    throw new GeminiUploadRpcToolError(httpErrorCode(response.status, response.text), `${request.kind} returned HTTP ${response.status}`);
  }
  return response;
}

async function uploadOneFile(file: GeminiUploadRpcFile, args: any, snapshot: GeminiRpcCdpSnapshot, fetchRpc: GeminiUploadRpcFetch): Promise<GeminiUploadRecord> {
  const start = await runFetchRequest(fetchRpc, buildGeminiUploadStartRequest(file, args, snapshot));
  const uploadUrl = headerValue(start.headers, "x-goog-upload-url") || headerValue(start.headers, "X-Goog-Upload-URL") || start.url;
  if (!uploadUrl) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini upload-start response did not include x-goog-upload-url");
  const finalize = await runFetchRequest(fetchRpc, buildGeminiUploadFinalizeRequest(file, uploadUrl, args, snapshot));
  const uri = String(finalize.text || "").trim();
  if (!uri || !/^\/contrib_service\//.test(uri)) {
    throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini upload-finalize response did not include a contrib_service URI", { fileName: file.fileName, response: uri.slice(0, 200) });
  }
  return { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, uri };
}

export function buildGeminiUploadAttachments(records: GeminiUploadRecord[]): unknown[] {
  return records.map((file) => [[file.uri, 3, null, file.mimeType], file.fileName, null, null, null, null, null, null, [0]]);
}

export function buildGeminiUploadCompletionFReq(prompt: string, template: GeminiRpcPayloadTemplate, records: GeminiUploadRecord[], args: any = {}): string {
  return buildGeminiStreamGenerateFReq(prompt, template, { ...args, __attachments: buildGeminiUploadAttachments(records) });
}

async function defaultGeminiUploadFetch(request: GeminiUploadRpcRequest): Promise<GeminiUploadRpcFetchResult> {
  const timeoutMs = Math.min(request.timeoutMs || DEFAULT_RESPONSE_TIMEOUT_MS, 180000);
  let body: BodyInit | undefined = request.body;
  if (request.bodyBase64) body = Buffer.from(request.bodyBase64, "base64");
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  return {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    text: await response.text(),
    headers,
    url: response.url
  };
}

function geminiUploadRpcErrorCode(error: any): ConsumerErrorCode {
  if (error instanceof PromptPolicyDeniedError) return ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|quota|overage|lockout/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function uploadBase(chatUrl: string, started: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    files_in_chip: [],
    chat_url: chatUrl,
    response_text: "",
    wait_ms: 0,
    elapsed_ms: Date.now() - started,
    completion_detected: false,
    errorCode: null,
    ...overrides
  };
}

function uploadErrorOutput(args: any, started: number, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = geminiUploadRpcErrorCode(error);
  return safeOutput(uploadBase(targetUrlForGeminiRpc(args || {}), started, {
    ok: false,
    service: "gemini",
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  }));
}

export async function webAiGeminiUploadAndQueryRpcWithFetch(args: any, fetchRpc: GeminiUploadRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  try {
    const prompt = String(effective.prompt || "");
    if (!prompt.trim()) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_upload_and_query requires prompt");
    assertPromptAllowed(prompt);
    const snapshot = effective.__cdpSnapshot as GeminiRpcCdpSnapshot;
    if (!snapshot) throw new GeminiUploadRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webAiGeminiUploadAndQueryRpcWithFetch requires args.__cdpSnapshot");
    const files = prepareUploadFiles(effective);
    const uploadRecords: GeminiUploadRecord[] = [];
    for (const file of files) uploadRecords.push(await uploadOneFile(file, effective, snapshot, fetchRpc));
    const names = uploadRecords.map((file) => file.fileName);
    const template = loadGeminiRpcPayloadTemplate(effective, "webai_gemini_upload_and_query--upload_and_query");
    const completionRequest = buildGeminiStreamGenerateRequest(effective, snapshot, template, buildGeminiUploadAttachments(uploadRecords));
    const completion = await runFetchRequest(fetchRpc, completionRequest);
    const decoded = decodeGeminiStream(completion.text);
    const waitMs = Date.now() - started;
    return safeOutput(uploadBase(snapshot.pageUrl || targetUrlForGeminiRpc(effective), started, {
      ok: true,
      service: "gemini",
      files_in_chip: names,
      uploaded_files: uploadRecords,
      response_text: decoded.text,
      wait_ms: waitMs,
      completion_detected: Boolean(decoded.text.trim()),
      errorCode: null,
      model_used: decoded.modelUsed
    }));
  } catch (error: any) {
    return uploadErrorOutput(effective, started, error);
  }
}

export async function webAiGeminiUploadAndQueryRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  const lease = acquireProfileLease(effective.profile);
  try {
    const snapshot = await captureGeminiCdpSnapshot(effective, runtime);
    return await webAiGeminiUploadAndQueryRpcWithFetch({ ...effective, __cdpSnapshot: snapshot }, effective.__fetch || defaultGeminiUploadFetch);
  } catch (error: any) {
    return uploadErrorOutput(effective, started, error);
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}

export const uploadGeminiRpc = webAiGeminiUploadAndQueryRpc;
