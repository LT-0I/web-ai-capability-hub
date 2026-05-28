const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
function createDefaultManagedBrowserLauncher(): ManagedBrowserLauncherLike {
  return require("../runtime/pool/profilePool").createManagedBrowserLauncher();
}

interface BrowserToolRuntime {
  launcher?: ManagedBrowserLauncherLike;
}

interface ManagedBrowserLauncherLike {
  launch(options?: { profile?: string; url?: string; cdpPort?: number }): Promise<{ connected: boolean; cdpEndpoint: string; lastError?: string }>;
}

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CHAT_URL = "https://gemini.google.com/app";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const GEMINI_HOST = "gemini.google.com";

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
  userAgent: string;
  pageUrl: string;
  conversationTuple?: unknown[];
}

interface GeminiRpcRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

interface GeminiDecodedStream {
  text: string;
  modelUsed: string | null;
}

class GeminiRpcToolError extends Error {
  errorCode: ConsumerErrorCode;
  constructor(errorCode: ConsumerErrorCode, message: string) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
  }
}

function nowMs(args: any): number {
  return typeof args?.__now === "function" ? Number(args.__now()) : Date.now();
}

function errorMessage(error: unknown, fallback = "UNKNOWN"): string {
  return error instanceof Error ? error.message : (error ? String(error) : fallback);
}

function asConsumerErrorCode(error: unknown, fallback: ConsumerErrorCode): ConsumerErrorCode {
  const value = (error as any)?.errorCode || (error as any)?.code;
  return isConsumerErrorCode(value) ? value : fallback;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function targetUrlForGemini(args: any): string {
  const value = String(args?.url || args?.tab_url_contains || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9_-]{6,}$/.test(value)) return `https://gemini.google.com/app/${value}`;
  return GEMINI_CHAT_URL;
}

function sendPromptBase(chatUrl: string, started: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    response_text: "",
    elapsed_ms: Date.now() - started,
    wait_ms: 0,
    completion_detected: false,
    errorCode: null,
    model_used: overrides.model_used ?? null,
    chat_url: chatUrl,
    reuse_conversation: Boolean(overrides.reuse_conversation),
    ...overrides
  };
}

function errorOutput(args: any, started: number, error: unknown, fallback: ConsumerErrorCode = ConsumerErrorCodes.COMMAND_TIMEOUT): Record<string, unknown> {
  const errorCode = asConsumerErrorCode(error, fallback);
  return sendPromptBase(targetUrlForGemini(args || {}), started, {
    ok: false,
    service: "gemini",
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessage(error, errorCode),
    model_used: null,
    reuse_conversation: Boolean(args?.reuse_conversation)
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function uuidUpper(): string {
  return crypto.randomUUID().toUpperCase();
}

function randomHex32(): string {
  return crypto.randomBytes(16).toString("hex");
}

export type GeminiSendPromptVariant =
  | "basic"
  | "model_flash"
  | "model_flash_lite"
  | "reuse_conversation"
  | "thinking_extended"
  | "thinking_web_search"
  | "web_search";

function normalizedGeminiModel(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[_\s]+/g, "-");
}

function geminiModelVariant(args: any): GeminiSendPromptVariant | null {
  const model = normalizedGeminiModel(args?.model);
  if (!model) return null;
  if (/flash-?lite/.test(model) || model === "3.1-flash-lite") return "model_flash_lite";
  if (/^(?:3\.5-)?flash$/.test(model) || model === "3.5-flash" || model === "3.1-pro" || model === "pro") return "model_flash";
  return null;
}

function wantsExtendedThinking(args: any): boolean {
  return Boolean(args?.thinking || String(args?.thinking_level || "").toLowerCase() === "extended");
}

function explicitGeminiConversationTarget(args: any): boolean {
  const value = String(args?.url || args?.tab_url_contains || "").trim();
  if (!value) return false;
  if (/^https?:\/\/gemini\.google\.com\/app\/[^/?#]+/i.test(value)) return true;
  return /^[A-Za-z0-9_-]{6,}$/.test(value);
}

function wantsReuseConversation(args: any): boolean {
  return Boolean(args?.reuse_conversation || explicitGeminiConversationTarget(args));
}

export function resolveGeminiSendPromptVariant(args: any = {}): GeminiSendPromptVariant {
  if (args?.web_search && wantsExtendedThinking(args)) return "thinking_web_search";
  if (args?.web_search) return "web_search";
  if (wantsReuseConversation(args)) return "reuse_conversation";
  const modelVariant = geminiModelVariant(args);
  if (modelVariant) return modelVariant;
  if (wantsExtendedThinking(args)) return "thinking_extended";
  return "basic";
}

function payloadTemplateCandidates(args: any): string[] {
  const root = process.cwd();
  const variant = resolveGeminiSendPromptVariant(args);
  const base = path.join(root, ".runs", "path-c-gemini-rpc", "wave-a-captures");
  // Path C Gemini Wave C2: web_search / thinking_web_search were captured live in
  // wave-c2-coverage-gaps (wave-a captures were blocked at the now-removed Google Search
  // toggle). Prefer the wave-c2 capture for those variants; otherwise fall back to the
  // wave-a basic template (web_search maps to the same StreamGenerate shape as basic).
  const c2Base = path.join(root, ".runs", "path-c-gemini-rpc", "wave-c2-coverage-gaps");
  return [
    args?.__payloadTemplatePath,
    path.join(base, `webai_gemini_send_prompt--${variant}`, "payload-template.json"),
    (variant === "web_search" || variant === "thinking_web_search")
      ? path.join(c2Base, "webai_gemini_send_prompt--web_search", "payload-template.json")
      : null,
    path.join(base, "webai_gemini_send_prompt--basic", "payload-template.json")
  ].filter(Boolean);
}

export function loadGeminiRpcPayloadTemplate(args: any = {}): GeminiRpcPayloadTemplate {
  if (args.__payloadTemplate) return args.__payloadTemplate as GeminiRpcPayloadTemplate;
  for (const candidate of payloadTemplateCandidates(args)) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch { /* try the next local capture artifact */ }
  }
  throw new GeminiRpcToolError(
    ConsumerErrorCodes.INVALID_ARGS,
    "Gemini RPC payload template was not found; expected .runs/path-c-gemini-rpc/wave-a-captures/webai_gemini_send_prompt--basic/payload-template.json or args.__payloadTemplate"
  );
}

function normalizeFReqInner(template: GeminiRpcPayloadTemplate): unknown[] {
  const top = template.f_req_template;
  if (!Array.isArray(top) || top.length < 2) {
    throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC payload template is missing f_req_template");
  }
  if (Array.isArray(top[1])) return cloneJson(top[1] as unknown[]);
  if (typeof top[1] === "string") {
    const parsed = JSON.parse(top[1]);
    if (Array.isArray(parsed)) return parsed;
  }
  throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC f_req_template has an unsupported shape");
}

function normalizeConversationTuple(value: unknown): unknown[] | null {
  if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" && typeof value[2] === "string") {
    const tuple = value.slice(0, 10);
    while (tuple.length < 10) tuple.push(null);
    if (tuple[9] === null || tuple[9] === undefined) tuple[9] = "";
    return tuple;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizeConversationTuple([
      record.conversation_id ?? record.conversationId,
      record.response_id ?? record.responseId,
      record.response_candidate_id ?? record.responseCandidateId ?? record.candidate_id ?? record.candidateId,
      null,
      null,
      null,
      null,
      null,
      null,
      record.context_token ?? record.contextToken ?? ""
    ]);
  }
  return null;
}

function isEmptyConversationTuple(value: unknown): boolean {
  return Array.isArray(value) && String(value[0] || "") === "" && String(value[1] || "") === "" && String(value[2] || "") === "";
}

function conversationTupleForRequest(args: any): unknown[] | null {
  return normalizeConversationTuple(args?.__conversationTuple || args?.conversation_tuple || args?.conversationTuple || args?.__cdpSnapshot?.conversationTuple);
}

function applyGeminiRpcVariantDeltas(inner: unknown[], args: any = {}): void {
  if (normalizedGeminiModel(args?.model).includes("flash-lite")) inner[79] = 6;
  if (wantsExtendedThinking(args)) inner[80] = 2;
  if (wantsReuseConversation(args)) {
    inner[17] = [[1]];
    const tuple = conversationTupleForRequest(args);
    if (tuple) {
      inner[2] = tuple;
    } else if (!Array.isArray(inner[2]) || isEmptyConversationTuple(inner[2])) {
      inner[2] = ["", "", "", null, null, null, null, null, null, ""];
    }
  }
}

export function buildGeminiRpcFReq(prompt: string, template: GeminiRpcPayloadTemplate, args: any = {}): string {
  const inner = normalizeFReqInner(template);
  if (!Array.isArray(inner[0])) {
    throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "Gemini RPC f_req_template prompt slot is missing");
  }
  (inner[0] as unknown[])[0] = prompt;
  applyGeminiRpcVariantDeltas(inner, args);
  if (typeof inner[4] === "string") inner[4] = randomHex32();
  if (typeof inner[59] === "string") inner[59] = uuidUpper();
  return JSON.stringify([null, JSON.stringify(inner)]);
}

function buildEndpoint(snapshot: GeminiRpcCdpSnapshot, args: any): string {
  const reqid = Number.isFinite(Number(args?.__reqid))
    ? Number(args.__reqid)
    : Math.floor(100000 + (Date.now() % 9000000));
  const url = new URL("https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate");
  url.searchParams.set("bl", snapshot.bl);
  url.searchParams.set("f.sid", snapshot.fsid);
  url.searchParams.set("hl", "en");
  url.searchParams.set("_reqid", String(reqid));
  url.searchParams.set("rt", "c");
  return url.toString();
}

export function buildGeminiRpcRequest(args: any, snapshot: GeminiRpcCdpSnapshot, template?: GeminiRpcPayloadTemplate): GeminiRpcRequest {
  const prompt = String(args?.prompt || "");
  if (!prompt.trim()) throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_send_prompt_rpc requires prompt");
  // Path C Gemini Wave C2: the web_search / thinking_web_search variants are now
  // RPC-available. The current Gemini build has NO "Google Search" tool toggle —
  // web grounding is automatic, driven by the server from prompt semantics, with no
  // client-controllable payload flag (the only inner-f.req delta a live capture showed
  // vs the basic template was inner[79], which encodes the model, not web search).
  // So web_search maps to the SAME StreamGenerate request as a basic send. It is
  // genuinely replayable via the existing StreamGenerate machinery: the captured
  // grounded response decoded cleanly (real source URLs) through decodeGeminiStream.
  // Evidence: .runs/path-c-gemini-rpc/wave-c2-coverage-gaps/webai_gemini_send_prompt--web_search/.
  const effectiveTemplate = template || loadGeminiRpcPayloadTemplate(args);
  const requestArgs = { ...args, __cdpSnapshot: snapshot };
  const form = new URLSearchParams();
  form.set("f.req", buildGeminiRpcFReq(prompt, effectiveTemplate, requestArgs));
  form.set("at", snapshot.at);
  return {
    url: buildEndpoint(snapshot, args),
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

function pageLooksLogin(url: string): boolean {
  return /accounts\.google\.com|signin/i.test(url || "");
}

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${url}`);
  return await response.json() as T;
}

async function cdpCommand(wsUrl: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const ws = new WebSocket(wsUrl);
  const pending = new Map<number, (value: any) => void>();
  let nextId = 0;
  ws.addEventListener("message", (event: MessageEvent) => {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      }
    } catch { /* CDP messages are JSON; ignore unrelated parser failures */ }
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error(`CDP websocket error for ${wsUrl}`)), { once: true });
  });
  try {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    const message = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP ${method} timed out`)), 5000);
      pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    if (message.error) throw new Error(`CDP ${method} failed: ${JSON.stringify(message.error)}`);
    return message.result;
  } finally {
    ws.close();
  }
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

function endpointOrigin(endpoint: string): string {
  const parsed = new URL(endpoint);
  return `${parsed.protocol}//${parsed.host}`;
}

async function ensureGeminiPage(endpoint: string): Promise<any> {
  const listUrl = `${endpointOrigin(endpoint)}/json/list`;
  let pages = await fetchJson<any[]>(listUrl);
  let page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
  if (page) return page;
  await fetch(`${endpointOrigin(endpoint)}/json/new?${encodeURIComponent(GEMINI_CHAT_URL)}`, { method: "PUT" }).catch(() => undefined);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    pages = await fetchJson<any[]>(listUrl).catch(() => []);
    page = pages.find((candidate) => candidate.type === "page" && String(candidate.url || "").includes(GEMINI_HOST) && !pageLooksLogin(String(candidate.url || "")));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const login = pages.find((candidate) => candidate.type === "page" && pageLooksLogin(String(candidate.url || "")));
  if (login) throw new GeminiRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC send_prompt");
  throw new GeminiRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "No Gemini CDP page was available for RPC token capture");
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

async function captureGeminiCdpSnapshot(args: any, runtime?: BrowserToolRuntime): Promise<GeminiRpcCdpSnapshot> {
  if (args?.__cdpSnapshot) return args.__cdpSnapshot as GeminiRpcCdpSnapshot;
  const profile = args?.profile || GEMINI_PROFILE;
  const launcher: ManagedBrowserLauncherLike = runtime?.launcher || createDefaultManagedBrowserLauncher();
  const status = await launcher.launch({ profile, url: targetUrlForGemini(args), cdpPort: args?.cdpPort });
  if (!status.connected) throw new GeminiRpcToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, status.lastError || `CDP endpoint is not connected for profile ${profile}`);
  const page = await ensureGeminiPage(status.cdpEndpoint);
  const wsUrl = page.webSocketDebuggerUrl;
  if (!wsUrl) throw new GeminiRpcToolError(ConsumerErrorCodes.TARGET_PAGE_MISSING, "Gemini CDP page did not expose a websocket debugger URL");
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
  if (pageLooksLogin(pageUrl)) throw new GeminiRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini login is required before RPC send_prompt");
  const at = String(value.at || "");
  const bl = String(value.bl || "");
  const fsid = String(value.fsid || "");
  if (!at || !bl || !fsid) {
    throw new GeminiRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC token capture did not find at/bl/f.sid on the logged-in page");
  }
  const cookieHeader = cookieHeaderForHost(cookieResult?.cookies || [], GEMINI_HOST);
  if (!cookieHeader) throw new GeminiRpcToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Gemini RPC cookie jar was empty");
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

function parseGeminiPayloadLines(streamText: string): unknown[] {
  const chunks: unknown[] = [];
  for (const line of String(streamText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    try {
      chunks.push(JSON.parse(trimmed));
    } catch (error) {
      throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_JSON, `Gemini RPC response chunk was not valid JSON: ${errorMessage(error)}`);
    }
  }
  if (!chunks.length) throw new GeminiRpcToolError(ConsumerErrorCodes.INVALID_JSON, "Gemini RPC response did not contain length-prefixed JSON chunks");
  return chunks;
}

function tryParseNestedJson(value: string): unknown | undefined {
  if (!value || !/^[\[{]/.test(value.trim())) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function normalizeCandidateText(value: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoilerplateText(value: string): boolean {
  const text = normalizeCandidateText(value);
  if (!text) return true;
  if (/^(wrb\.fr|af\.httprm|di|e|und|US|en)$/i.test(text)) return true;
  if (/^(Longer|Shorter|Try again|Don't personalize|expand|compress|refresh|person_cancel|Analysis|Analyzing)$/i.test(text)) return true;
  if (/^SWML_/i.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^\/\/www\.google\.com\//i.test(text)) return true;
  if (/^type\.googleapis\.com\/assistant\./i.test(text)) return true;
  if (/^BardErrorInfo$/i.test(text)) return true;
  if (/^-?\d{10,}$/.test(text)) return true;
  if (/^(c|r|rc)_[a-f0-9]+$/i.test(text)) return true;
  if (/^[A-Za-z0-9_-]{20,}$/.test(text) && !/\s/.test(text)) return true;
  return false;
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    const parsed = tryParseNestedJson(value);
    if (parsed !== undefined) collectStrings(parsed, out);
    else if (!isBoilerplateText(value)) out.push(normalizeCandidateText(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, out);
  }
}

function displayTextFromNested(nested: unknown): string[] {
  if (!Array.isArray(nested)) return [];
  const display = nested[4];
  if (!Array.isArray(display)) return [];
  const candidates: string[] = [];
  for (const item of display) {
    if (!Array.isArray(item)) continue;
    const textParts = item[1];
    if (Array.isArray(textParts)) {
      const joined = textParts.map((part) => typeof part === "string" ? part : "").filter(Boolean).join("\n");
      if (!isBoilerplateText(joined)) candidates.push(normalizeCandidateText(joined));
    }
  }
  return candidates;
}

function structuredTextFromNested(nested: unknown): string[] {
  if (!Array.isArray(nested)) return [];
  const structured = nested[26];
  const candidates: string[] = [];
  collectStrings(structured, candidates);
  return candidates;
}

function modelUsedFromNested(nested: unknown): string | null {
  const strings: string[] = [];
  collectStrings(nested, strings);
  const model = strings.find((value) => /^(?:\d+(?:\.\d+)?\s*)?(?:Flash(?:-Lite)?|Pro)$/i.test(value) || /^\d+(?:\.\d+)?\s+(?:Flash(?:-Lite)?|Pro)$/i.test(value));
  return model || null;
}

function extractDecodedStream(chunks: unknown[]): GeminiDecodedStream {
  const displayCandidates: string[] = [];
  const structuredCandidates: string[] = [];
  const fallbackCandidates: string[] = [];
  let modelUsed: string | null = null;

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const nested = tryParseNestedJson(value);
      if (nested !== undefined) {
        displayCandidates.push(...displayTextFromNested(nested));
        structuredCandidates.push(...structuredTextFromNested(nested));
        modelUsed = modelUsed || modelUsedFromNested(nested);
        visit(nested);
      } else if (!isBoilerplateText(value)) {
        fallbackCandidates.push(normalizeCandidateText(value));
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) visit(item);
    }
  };

  for (const chunk of chunks) visit(chunk);
  const best = displayCandidates.at(-1) || structuredCandidates.at(-1) || fallbackCandidates.at(-1) || "";
  return { text: normalizeCandidateText(best), modelUsed };
}

export function decodeGeminiStream(streamText: string): GeminiDecodedStream {
  return extractDecodedStream(parseGeminiPayloadLines(streamText));
}

export function decodeGeminiStreamText(streamText: string): string {
  return decodeGeminiStream(streamText).text;
}

function httpErrorCode(status: number): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 429) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  return ConsumerErrorCodes.COMMAND_TIMEOUT;
}

export async function webAiGeminiSendPromptRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  try {
    const snapshot = await captureGeminiCdpSnapshot(effective, runtime);
    const request = buildGeminiRpcRequest(effective, snapshot);
    const fetchImpl = effective.__fetch || fetch;
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(Math.min(responseTimeoutMs(effective), 180000))
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new GeminiRpcToolError(httpErrorCode(Number(response.status)), `Gemini RPC StreamGenerate returned HTTP ${response.status}`);
    }
    const decoded = decodeGeminiStream(bodyText);
    const waitMs = Date.now() - started;
    if (!decoded.text.trim()) {
      throw new GeminiRpcToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Gemini RPC StreamGenerate completed without decoded assistant text");
    }
    return sendPromptBase(snapshot.pageUrl || targetUrlForGemini(effective), started, {
      response_text: decoded.text,
      wait_ms: waitMs,
      completion_detected: true,
      errorCode: null,
      model_used: decoded.modelUsed,
      reuse_conversation: Boolean(effective.reuse_conversation)
    });
  } catch (error) {
    const fallback = (error as any)?.errorCode === ConsumerErrorCodes.INVALID_JSON
      ? ConsumerErrorCodes.INVALID_JSON
      : ConsumerErrorCodes.COMMAND_TIMEOUT;
    return errorOutput(effective, started, error, fallback);
  }
}

export const sendGeminiPromptRpc = webAiGeminiSendPromptRpc;
