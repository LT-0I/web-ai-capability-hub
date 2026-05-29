const fs = require("node:fs");
const path = require("node:path");
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

const CLAUDE_FRESH_URL = "https://claude.ai/new";
const CLAUDE_INCOGNITO_FRESH_URL = "https://claude.ai/new?incognito=";
const DEFAULT_CLAUDE_PROFILE = "claude-9224";
const DEFAULT_CLAUDE_CDP_PORT = 9224;
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPTURED_TEMPLATE_PATH = path.join(process.cwd(), ".runs/claude-rpc-spike/captures/send/request-body.txt");
const CLAUDE_WEB_SEARCH_TOOL = { type: "web_search_v0", name: "web_search" };

export interface ClaudeRpcRequest {
  url: string;
  body: string;
  profile: string;
  timeoutMs: number;
}

export interface ClaudeRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
}

export type ClaudeRpcFetch = (request: ClaudeRpcRequest) => Promise<ClaudeRpcFetchResult>;

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
  return normalizeUrlLikeTarget(args?.url) || normalizeUrlLikeTarget(args?.tab_url_contains) || (args?.incognito ? CLAUDE_INCOGNITO_FRESH_URL : CLAUDE_FRESH_URL);
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function sendPromptBase(chatUrl: string, started: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const conversationId = conversationIdFromUrl(chatUrl);
  return {
    response_text: "",
    conversation_id: conversationId || null,
    model_used: null,
    http_status: null,
    elapsed_ms: Date.now() - started,
    wait_ms: 0,
    completion_detected: false,
    errorCode: null,
    ...overrides,
    chat_url: chatUrl
  };
}

function claudeRpcErrorCode(error: any): ConsumerErrorCode {
  if (error instanceof PromptPolicyDeniedError) return ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  if (isConsumerErrorCode(error?.errorCode)) return error.errorCode;
  if (isConsumerErrorCode(error?.code)) return error.code;
  const message = errorMessageFromUnknown(error, "");
  if (/invalid json|decode|parse/i.test(message)) return ConsumerErrorCodes.INVALID_JSON;
  if (/timeout|timed out|aborted|aborterror/i.test(message)) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (/429|rate.?limit|message_limit|quota|overage/i.test(message)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (/login|required|authorization|session|permission|401|403|account_session_invalid/i.test(message)) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (/ECONNREFUSED|connect.*CDP|browser.*not.*launched|No CDP page/i.test(message)) return ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
  return ConsumerErrorCodes.UNKNOWN;
}

function claudeRpcErrorOutput(args: any, started: number, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode = claudeRpcErrorCode(error);
  const chatUrl = typeof extra.chat_url === "string" ? extra.chat_url : targetUrlForClaude(args || {});
  const { chat_url: _chatUrl, ...rest } = extra;
  return safeOutput(sendPromptBase(chatUrl, started, {
    ok: false,
    service: "claude",
    response_text: "",
    wait_ms: 0,
    completion_detected: false,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...rest
  }));
}

function httpStatusErrorCode(status: number, body: string): ConsumerErrorCode {
  if (status === 401 || status === 403) return ConsumerErrorCodes.LOGIN_REQUIRED;
  if (status === 408 || status === 504) return ConsumerErrorCodes.COMMAND_TIMEOUT;
  if (status === 429 || /rate.?limit|quota|message_limit|overage/i.test(body)) return ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED;
  if (status >= 400 && status < 500) return ConsumerErrorCodes.INVALID_ARGS;
  return ConsumerErrorCodes.UNKNOWN;
}

export function decodeClaudeRpcSse(streamText: string): string {
  return decodeClaudeRpcSseEnvelope(streamText).responseText;
}

export interface ClaudeRpcDecodedStream {
  responseText: string;
  modelUsed: string | null;
  messageUuid: string | null;
}

export function decodeClaudeRpcSseEnvelope(streamText: string): ClaudeRpcDecodedStream {
  let assistantText = "";
  let sawData = false;
  let sawStop = false;
  let modelUsed: string | null = null;
  let messageUuid: string | null = null;
  for (const block of String(streamText || "").split(/\r?\n\r?\n+/)) {
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    sawData = true;
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") continue;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch (error: any) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, `Claude RPC SSE decode failed: ${errorMessageFromUnknown(error, "invalid JSON")}`);
    }
    if (parsed?.type === "error" || parsed?.error) {
      const message = parsed?.error?.message || parsed?.message || "Claude RPC stream returned an error event";
      throw new WebAiToolError(claudeRpcErrorCode(message), message);
    }
    if (parsed?.type === "message_start" && parsed?.message) {
      if (typeof parsed.message.model === "string" && parsed.message.model.trim()) modelUsed = parsed.message.model;
      if (typeof parsed.message.uuid === "string" && UUID_RE.test(parsed.message.uuid)) messageUuid = parsed.message.uuid;
    }
    if (parsed?.delta?.type === "text_delta" && typeof parsed.delta.text === "string") assistantText += parsed.delta.text;
    if (parsed?.type === "message_stop") sawStop = true;
  }
  if (!sawData) throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, "Claude RPC response was not an SSE stream");
  if (!sawStop && !assistantText) throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Claude RPC stream ended before assistant text was emitted");
  return { responseText: assistantText, modelUsed, messageUuid };
}

let cachedTemplate: any | undefined;

function fallbackPayloadTemplate(): any {
  return {
    prompt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    personalized_styles: [{
      type: "default",
      key: "Default",
      name: "Normal",
      nameKey: "normal_style_name",
      prompt: "Normal\n",
      summary: "Default responses from Claude",
      summaryKey: "normal_style_summary",
      isDefault: true
    }],
    locale: "en-US",
    model: DEFAULT_CLAUDE_MODEL,
    tools: [
      { name: "show_widget" },
      { name: "read_me" },
      { type: "artifacts_v0", name: "artifacts" },
      { type: "repl_v0", name: "repl" },
      { type: "widget", name: "weather_fetch" },
      { type: "widget", name: "recipe_display_v0" },
      { type: "widget", name: "places_map_display_v0" },
      { type: "widget", name: "message_compose_v1" },
      { type: "widget", name: "ask_user_input_v0" },
      { type: "widget", name: "recommend_claude_apps" },
      { type: "widget", name: "places_search" },
      { type: "widget", name: "fetch_sports_data" }
    ],
    turn_message_uuids: {
      human_message_uuid: crypto.randomUUID(),
      assistant_message_uuid: crypto.randomUUID()
    },
    attachments: [],
    files: [],
    sync_sources: [],
    rendering_mode: "messages",
    create_conversation_params: {
      name: "",
      model: DEFAULT_CLAUDE_MODEL,
      include_conversation_preferences: true,
      paprika_mode: null,
      compass_mode: null,
      is_temporary: false,
      enabled_imagine: true
    }
  };
}

function capturedPayloadTemplate(): any {
  if (cachedTemplate) return cachedTemplate;
  try {
    cachedTemplate = JSON.parse(fs.readFileSync(CAPTURED_TEMPLATE_PATH, "utf8"));
  } catch {
    cachedTemplate = fallbackPayloadTemplate();
  }
  return cachedTemplate;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizeClaudeModel(model: unknown): string {
  const value = String(model || "").trim();
  if (!value) return DEFAULT_CLAUDE_MODEL;
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
    "claude sonnet": "claude-sonnet-4-6",
    "sonnet 4": "claude-sonnet-4-6",
    "sonnet 4.6": "claude-sonnet-4-6",
    "claude sonnet 4.6": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "claude haiku": "claude-haiku-4-5-20251001",
    "haiku 4.5": "claude-haiku-4-5-20251001",
    "claude haiku 4.5": "claude-haiku-4-5-20251001"
  };
  return known[normalized] || value;
}

function defaultClaudeStyle(): Record<string, unknown> {
  return {
    type: "default",
    key: "Default",
    name: "Normal",
    nameKey: "normal_style_name",
    prompt: "Normal\n",
    summary: "Default responses from Claude",
    summaryKey: "normal_style_summary",
    isDefault: true
  };
}

function conciseClaudeStyle(): Record<string, unknown> {
  return {
    type: "default",
    key: "Concise",
    name: "Concise",
    nameKey: "concise_style_name",
    prompt: [
      "Claude is operating in Concise Mode. In this mode, Claude aims to reduce its output tokens while maintaining its helpfulness, quality, completeness, and accuracy.",
      "Claude provides answers to questions without much unneeded preamble or postamble. It focuses on addressing the specific query or task at hand, avoiding tangential information unless helpful for understanding or completing the request. If it decides to create a list, Claude focuses on key information instead of comprehensive enumeration.",
      "Claude maintains a helpful tone while avoiding excessive pleasantries or redundant offers of assistance.",
      "Claude provides relevant evidence and supporting details when substantiation is helpful for factuality and understanding of its response. For numerical data, Claude includes specific figures when important to the answer's accuracy.",
      "For code, artifacts, written content, or other generated outputs, Claude maintains the exact same level of quality, completeness, and functionality as when NOT in Concise Mode. There should be no impact to these output types.",
      "Claude does not compromise on completeness, correctness, appropriateness, or helpfulness for the sake of brevity.",
      "If the human requests a long or detailed response, Claude will set aside Concise Mode constraints and provide a more comprehensive answer.",
      "If the human appears frustrated with Claude's conciseness, repeatedly requests longer or more detailed responses, or directly asks about changes in Claude's response style, Claude informs them that it's currently in Concise Mode and explains that Concise Mode can be turned off via Claude's UI if desired. Besides these scenarios, Claude does not mention Concise Mode."
    ].join("\n"),
    summary: "Shorter responses & more messages",
    summaryKey: "concise_style_summary",
    isDefault: false
  };
}

function explanatoryClaudeStyle(): Record<string, unknown> {
  return {
    type: "default",
    key: "Explanatory",
    name: "Explanatory",
    nameKey: "explanatory_style_name",
    prompt: [
      "Claude aims to give clear, thorough explanations that help the human deeply understand complex topics.",
      "Claude approaches questions like a teacher would, breaking down ideas into easier parts and building up to harder concepts. It uses comparisons, examples, and step-by-step explanations to improve understanding.",
      "Claude keeps a patient and encouraging tone, trying to spot and address possible points of confusion before they arise. Claude may ask thinking questions or suggest mental exercises to get the human more involved in learning.",
      "Claude gives background info when it helps create a fuller picture of the topic. It might sometimes branch into related topics if they help build a complete understanding of the subject.",
      "When writing code or other technical content, Claude adds helpful comments to explain the thinking behind important steps.",
      "Claude always writes prose and in full sentences, especially for reports, documents, explanations, and question answering. Claude can use bullets only if the user asks specifically for a list."
    ].join("\n"),
    summary: "Educational responses for learning",
    summaryKey: "explanatory_style_summary",
    isDefault: false
  };
}

function claudeStyleForArgs(style: unknown): Record<string, unknown> | undefined {
  const normalized = String(style || "").trim().toLowerCase().replace(/^style[_\s-]*/, "").replace(/[_\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized === "concise") return conciseClaudeStyle();
  if (normalized === "explanatory" || normalized === "explain") return explanatoryClaudeStyle();
  return {
    type: "custom",
    key: String(style),
    name: String(style),
    prompt: `${String(style)}\n`,
    summary: `Claude style: ${String(style)}`,
    isDefault: false
  };
}

function applyClaudeWebSearchTool(payload: Record<string, any>, enabled: boolean): void {
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const withoutWebSearch = tools.filter((tool: any) => tool?.name !== "web_search" && tool?.type !== "web_search_v0");
  if (!enabled) {
    payload.tools = withoutWebSearch;
    return;
  }
  const readMeIndex = withoutWebSearch.findIndex((tool: any) => tool?.name === "read_me");
  const insertAt = readMeIndex >= 0 ? readMeIndex + 1 : 0;
  payload.tools = [
    ...withoutWebSearch.slice(0, insertAt),
    { ...CLAUDE_WEB_SEARCH_TOOL },
    ...withoutWebSearch.slice(insertAt)
  ];
}

export function buildClaudeRpcPayload(args: any): Record<string, unknown> {
  const model = normalizeClaudeModel(args?.model);
  const payload: Record<string, any> = cloneJson(capturedPayloadTemplate());
  payload.prompt = String(args?.prompt || "");
  payload.timezone = payload.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  payload.locale = payload.locale || "en-US";
  payload.model = model;
  payload.turn_message_uuids = {
    human_message_uuid: crypto.randomUUID(),
    assistant_message_uuid: crypto.randomUUID()
  };
  payload.attachments = [];
  payload.files = [];
  payload.sync_sources = [];
  payload.rendering_mode = "messages";
  payload.personalized_styles = [claudeStyleForArgs(args?.style) || defaultClaudeStyle()];
  applyClaudeWebSearchTool(payload, Boolean(args?.web_search));
  if (args?.reuse_conversation) {
    delete payload.create_conversation_params;
    const parentMessageUuid = String(args?.parent_message_uuid || args?.parentMessageUuid || "").trim();
    if (UUID_RE.test(parentMessageUuid)) payload.parent_message_uuid = parentMessageUuid;
  } else {
    delete payload.parent_message_uuid;
    payload.create_conversation_params = {
      ...(payload.create_conversation_params || {}),
      name: "",
      model,
      include_conversation_preferences: true,
      paprika_mode: args?.thinking ? "extended" : null,
      compass_mode: null,
      is_temporary: false,
      enabled_imagine: (payload.create_conversation_params || {}).enabled_imagine ?? true
    };
  }
  return payload;
}

function conversationIdFromUrl(url: string): string | undefined {
  const match = /\/(?:chat|c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(url);
  return match?.[1];
}

function effectiveConversationId(args: any, fallback?: string): string {
  const explicit = String(args?.conversation_id || args?.conversationId || "").trim();
  if (UUID_RE.test(explicit)) return explicit;
  if (args?.reuse_conversation) {
    const fromTarget = conversationIdFromUrl(String(args?.url || args?.tab_url_contains || ""));
    if (fromTarget) return fromTarget;
  }
  if (fallback && UUID_RE.test(fallback)) return fallback;
  return crypto.randomUUID();
}

function completionUrl(orgId: string, conversationId: string): string {
  return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
}

function chatUrl(conversationId: string): string {
  return `https://claude.ai/chat/${conversationId}`;
}

function conversationDetailsUrl(orgId: string, conversationId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(conversationId)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual`;
}

function parentMessageUuidFromArgs(args: any): string | undefined {
  const value = String(args?.parent_message_uuid || args?.parentMessageUuid || "").trim();
  return UUID_RE.test(value) ? value : undefined;
}

async function fetchClaudeCompletionInPage(page: any, request: ClaudeRpcRequest): Promise<ClaudeRpcFetchResult> {
  const started = Date.now();
  const result = await page.evaluate(async ({ url, body, timeoutMs }: { url: string; body: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { accept: "text/event-stream", "content-type": "application/json" },
        body,
        signal: controller.signal
      });
      const text = await response.text();
      return {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        url: response.url,
        text
      };
    } finally {
      clearTimeout(timer);
    }
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
  const cdpPort = Number(args?.cdp_port ?? args?.cdpPort ?? (/-(\d{4,5})$/.exec(profile)?.[1]) ?? DEFAULT_CLAUDE_CDP_PORT);
  const endpoint = String(args?.cdp_endpoint || args?.cdpEndpoint || `http://127.0.0.1:${cdpPort}`);
  return chromium.connectOverCDP(endpoint);
}

async function claudeOriginPage(browser: any, args: any): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new WebAiToolError(ConsumerErrorCodes.BROWSER_NOT_LAUNCHED, "No browser context is available from the Claude CDP connection");
  const pages = context.pages?.() || [];
  const isClaude = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "claude.ai" || parsed.hostname === "www.claude.ai";
    } catch {
      return false;
    }
  };
  let page = pages.find((candidate: any) => isClaude(String(candidate.url?.() || "")));
  if (!page) page = await context.newPage();
  const target = targetUrlForClaude(args);
  const currentUrl = String(page.url?.() || "");
  const requestedRaw = args?.url || args?.tab_url_contains;
  const requestedUrl = normalizeUrlLikeTarget(requestedRaw);
  const needsRequestedNavigation = requestedUrl && (!currentUrl || !currentUrl.includes(String(requestedRaw)) && currentUrl !== requestedUrl);
  const needsIncognitoNavigation = Boolean(args?.incognito && !args?.reuse_conversation && !requestedRaw);
  const freshTarget = args?.incognito ? CLAUDE_INCOGNITO_FRESH_URL : CLAUDE_FRESH_URL;
  const needsFreshNavigation = Boolean(!args?.reuse_conversation && !requestedRaw && currentUrl !== freshTarget);
  if (!isClaude(currentUrl) || needsRequestedNavigation || needsIncognitoNavigation || needsFreshNavigation) {
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
        for (const item of value) {
          const found = findUuid(item);
          if (found) return found;
        }
        return null;
      }
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of ["uuid", "id", "organization_uuid", "organizationUuid"]) {
          const found = findUuid(record[key]);
          if (found) return found;
        }
        for (const item of Object.values(record)) {
          const found = findUuid(item);
          if (found) return found;
        }
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

async function activeClaudeParentMessageUuid(page: any, orgId: string, conversationId: string, args: any): Promise<string> {
  const explicit = parentMessageUuidFromArgs(args);
  if (explicit) return explicit;
  const timeoutMs = Math.min(responseTimeoutMs(args), 30000);
  const result = await page.evaluate(async ({ url, timeoutMs }: { url: string; timeoutMs: number }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      const text = await response.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        current_leaf_message_uuid: json?.current_leaf_message_uuid || null
      };
    } finally {
      clearTimeout(timer);
    }
  }, { url: conversationDetailsUrl(orgId, conversationId), timeoutMs });
  if (!result?.ok) {
    throw new WebAiToolError(httpStatusErrorCode(Number(result?.status || 0), String(result?.text || "")), `Claude RPC reuse_conversation lookup returned HTTP ${result?.status || "unknown"}`);
  }
  if (typeof result.current_leaf_message_uuid === "string" && UUID_RE.test(result.current_leaf_message_uuid)) return result.current_leaf_message_uuid;
  throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude RPC reuse_conversation could not resolve current_leaf_message_uuid");
}

export async function webAiClaudeSendPromptRpcWithFetch(
  args: any,
  fetchCompletion: ClaudeRpcFetch,
  options: { orgId?: string; conversationId?: string; parentMessageUuid?: string; started?: number } = {}
): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const started = options.started || Date.now();
  let conversationId: string | undefined;
  let modelUsed: string | null = normalizeClaudeModel(effective.model);
  let httpStatus: number | null = null;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_send_prompt requires a string prompt");
    }
    assertPromptAllowed(effective.prompt);
    const orgId = options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId;
    if (!orgId || !UUID_RE.test(String(orgId))) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC send_prompt");
    conversationId = effectiveConversationId(effective, options.conversationId);
    const parentMessageUuid = options.parentMessageUuid || parentMessageUuidFromArgs(effective);
    if (effective.reuse_conversation && !parentMessageUuid) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude RPC reuse_conversation requires parent_message_uuid");
    }
    const request: ClaudeRpcRequest = {
      url: completionUrl(String(orgId), conversationId),
      body: JSON.stringify(buildClaudeRpcPayload({ ...effective, parent_message_uuid: parentMessageUuid })),
      profile: String(effective.profile),
      timeoutMs: responseTimeoutMs(effective)
    };
    const fetchStarted = Date.now();
    const response = await fetchCompletion(request);
    httpStatus = response.status;
    const waitMs = response.elapsedMs ?? (Date.now() - fetchStarted);
    if (response.status !== 200) {
      const code = httpStatusErrorCode(response.status, response.text || "");
      return claudeRpcErrorOutput(effective, started, new WebAiToolError(code, `Claude RPC completion returned HTTP ${response.status}`), {
        chat_url: chatUrl(conversationId),
        conversation_id: conversationId,
        model_used: modelUsed,
        http_status: response.status
      });
    }
    const decoded = decodeClaudeRpcSseEnvelope(response.text);
    const responseText = decoded.responseText;
    modelUsed = decoded.modelUsed || modelUsed;
    if (!responseText.trim()) {
      throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Claude RPC completion finished without assistant text");
    }
    return safeOutput(sendPromptBase(chatUrl(conversationId), started, {
      response_text: responseText,
      wait_ms: waitMs,
      completion_detected: true,
      errorCode: null,
      model_used: modelUsed,
      http_status: response.status
    }));
  } catch (error: any) {
    return claudeRpcErrorOutput(effective, started, error, {
      ...(conversationId ? { chat_url: chatUrl(conversationId), conversation_id: conversationId } : {}),
      model_used: modelUsed,
      http_status: httpStatus
    });
  }
}

export async function webAiClaudeSendPromptRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const started = Date.now();
  let lease: string | undefined;
  let browser: any;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_send_prompt requires a string prompt");
    }
    assertPromptAllowed(effective.prompt);
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      return safeOutput(sendPromptBase(String(page.url?.() || targetUrlForClaude(effective)), started, {
        ok: false,
        service: "claude",
        errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
        error_code: ConsumerErrorCodes.LOGIN_REQUIRED
      }));
    }
    const orgId = await activeClaudeOrgId(page, effective);
    let conversationId: string | undefined;
    let parentMessageUuid: string | undefined;
    if (effective.reuse_conversation) {
      const pageConversationId = conversationIdFromUrl(String(page.url?.() || ""));
      conversationId = effectiveConversationId({ ...effective, url: effective.url || effective.tab_url_contains || String(page.url?.() || "") }, pageConversationId);
      if (!conversationId || !UUID_RE.test(conversationId) || (!pageConversationId && !effective.conversation_id && !effective.conversationId)) {
        throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude RPC reuse_conversation requires an existing Claude conversation URL or conversation_id");
      }
      parentMessageUuid = await activeClaudeParentMessageUuid(page, orgId, conversationId, effective);
    }
    return await webAiClaudeSendPromptRpcWithFetch(
      { ...effective, organization_id: orgId, ...(conversationId ? { conversation_id: conversationId } : {}), ...(parentMessageUuid ? { parent_message_uuid: parentMessageUuid } : {}) },
      (request) => fetchClaudeCompletionInPage(page, request),
      { orgId, conversationId, parentMessageUuid, started }
    );
  } catch (error: any) {
    return claudeRpcErrorOutput(effective, started, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
