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
import { buildClaudeRpcPayload, decodeClaudeRpcSseEnvelope } from "./claude_send_prompt_rpc";

const CLAUDE_FRESH_URL = "https://claude.ai/new";
const CLAUDE_INCOGNITO_FRESH_URL = "https://claude.ai/new?incognito=";
const DEFAULT_CLAUDE_PROFILE = "claude-9224";
const DEFAULT_CLAUDE_CDP_PORT = 9224;
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;
const MAX_CLAUDE_UPLOAD_FILES = 3;
const MAX_CLAUDE_UPLOAD_BYTES = 25 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaudeUploadRpcFile {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
  textContent: string | null;
  image: boolean;
}

export interface ClaudeUploadRpcRequest {
  kind: "upload" | "completion";
  url: string;
  profile: string;
  timeoutMs: number;
  file?: ClaudeUploadRpcFile;
  body?: string;
}

export interface ClaudeUploadRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  url?: string;
  elapsedMs?: number;
}

export type ClaudeUploadRpcFetch = (request: ClaudeUploadRpcRequest) => Promise<ClaudeUploadRpcFetchResult>;

interface UploadResponseRecord {
  success?: boolean;
  path?: string;
  sanitized_name?: string;
  file_kind?: string;
  file_uuid?: string;
  file_id?: string;
  file_name?: string;
  file_url?: string;
  size_bytes?: number;
  uuid?: string;
  [key: string]: unknown;
}

interface PreparedClaudeUpload {
  effective: Record<string, any>;
  files: ClaudeUploadRpcFile[];
}

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

function uploadTimeoutMs(args: any): number {
  const value = Number(args?.timeout_ms ?? args?.timeoutMs ?? 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function normalizeClaudeModel(model: unknown): string {
  const value = String(model || "").trim();
  if (!value) return DEFAULT_CLAUDE_MODEL;
  if (/^claude-/i.test(value)) return value;
  const normalized = value.toLowerCase().replace(/\s+/g, " ");
  const known: Record<string, string> = {
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

function parentMessageUuidFromArgs(args: any): string | undefined {
  const value = String(args?.parent_message_uuid || args?.parentMessageUuid || "").trim();
  return UUID_RE.test(value) ? value : undefined;
}

function completionUrl(orgId: string, conversationId: string): string {
  return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
}

function uploadFileUrl(orgId: string, conversationId: string): string {
  return `https://claude.ai/api/organizations/${orgId}/conversations/${conversationId}/wiggle/upload-file`;
}

function chatUrl(conversationId: string): string {
  return `https://claude.ai/chat/${conversationId}`;
}

function conversationDetailsUrl(orgId: string, conversationId: string): string {
  return `/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(conversationId)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual`;
}

function claudeUploadRpcErrorCode(error: any): ConsumerErrorCode {
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

function uploadRpcBase(chat_url: string, started: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const conversationId = conversationIdFromUrl(chat_url);
  return {
    response_text: "",
    conversation_id: conversationId || null,
    model_used: null,
    http_status: null,
    elapsed_ms: Date.now() - started,
    wait_ms: 0,
    completion_detected: false,
    errorCode: null,
    files_uploaded_count: 0,
    attachment_names: [],
    ...overrides,
    chat_url
  };
}

function uploadRpcErrorOutput(
  args: any,
  started: number,
  error: any,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const errorCode = claudeUploadRpcErrorCode(error);
  const chat_url = typeof extra.chat_url === "string" ? extra.chat_url : targetUrlForClaude(args || {});
  const { chat_url: _chatUrl, ...rest } = extra;
  return safeOutput(uploadRpcBase(chat_url, started, {
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
    ".pdf": "application/pdf"
  };
  return mimeByExt[ext] || "application/octet-stream";
}

function isTextMime(mimeType: string): boolean {
  return /^text\//i.test(mimeType) || /^(application\/(json|xml|x-ndjson))$/i.test(mimeType);
}

function preparedClaudeUpload(args: any): PreparedClaudeUpload {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  if (!effective.prompt || typeof effective.prompt !== "string") {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_upload_and_query requires a string prompt");
  }
  assertPromptAllowed(effective.prompt);
  if (!Array.isArray(effective.files)) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "files must be an array");
  }
  if (!effective.files.length) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_upload_and_query requires at least one file");
  }
  if (effective.files.length > MAX_CLAUDE_UPLOAD_FILES) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude upload_and_query supports at most 3 files");
  }

  const files = effective.files.map((inputFile: string) => {
    if (typeof inputFile !== "string" || !inputFile.trim()) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "upload file paths must be non-empty strings");
    }
    const resolved = path.resolve(inputFile);
    if (!fs.existsSync(resolved)) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file(s) not found: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload path is not a file: ${resolved}`);
    }
    if (stat.size > MAX_CLAUDE_UPLOAD_BYTES) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `upload file exceeds ${MAX_CLAUDE_UPLOAD_BYTES} byte limit: ${resolved}`);
    }
    const buffer = fs.readFileSync(resolved);
    const mimeType = mimeTypeForFile(resolved);
    return {
      path: resolved,
      fileName: path.basename(resolved),
      mimeType,
      sizeBytes: stat.size,
      base64: buffer.toString("base64"),
      textContent: isTextMime(mimeType) ? buffer.toString("utf8") : null,
      image: /^image\//i.test(mimeType)
    };
  });

  return { effective, files };
}

function parseUploadJson(response: ClaudeUploadRpcFetchResult, file: ClaudeUploadRpcFile): UploadResponseRecord {
  if (response.status < 200 || response.status >= 300) {
    throw new WebAiToolError(httpStatusErrorCode(response.status, response.text || ""), `Claude upload-file returned HTTP ${response.status}`);
  }
  let parsed: UploadResponseRecord;
  try {
    parsed = response.text ? JSON.parse(response.text) : {};
  } catch (error: any) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, `Claude upload-file response was not JSON for ${file.fileName}: ${errorMessageFromUnknown(error, "invalid JSON")}`);
  }
  const fileId = uploadFileId(parsed);
  if (parsed.success === false || !fileId) {
    throw new WebAiToolError(ConsumerErrorCodes.INVALID_JSON, `Claude upload-file response missing file id for ${file.fileName}`);
  }
  return parsed;
}

function uploadFileId(upload: UploadResponseRecord): string {
  return String(upload.file_uuid || upload.uuid || upload.file_id || "").trim();
}

function uploadFileUrlValue(upload: UploadResponseRecord): string {
  return String(upload.file_url || upload.path || upload.preview_url || "").trim();
}

function attachmentFromUpload(file: ClaudeUploadRpcFile, upload: UploadResponseRecord): Record<string, unknown> {
  const fileName = String(upload.file_name || upload.sanitized_name || file.fileName);
  return {
    file_name: fileName,
    file_type: file.mimeType,
    file_size: Number(upload.size_bytes || file.sizeBytes),
    extracted_content: file.textContent || "",
    origin: "user_upload",
    kind: "file",
    path: uploadFileUrlValue(upload) || `/mnt/user-data/uploads/${fileName}`
  };
}

export function buildClaudeUploadCompletionPayload(args: any, files: ClaudeUploadRpcFile[], uploads: UploadResponseRecord[]): Record<string, unknown> {
  const payload: Record<string, any> = buildClaudeRpcPayload(args);
  payload.attachments = [];
  payload.files = [];
  for (let index = 0; index < uploads.length; index += 1) {
    const file = files[index];
    const upload = uploads[index];
    const fileId = uploadFileId(upload);
    if (file.image || String(upload.file_kind || "").toLowerCase() === "image") {
      payload.files.push(fileId);
    } else {
      payload.attachments.push(attachmentFromUpload(file, upload));
    }
  }
  return payload;
}

export async function webAiClaudeUploadAndQueryRpcWithFetch(
  args: any,
  fetchRpc: ClaudeUploadRpcFetch,
  options: { orgId?: string; conversationId?: string; parentMessageUuid?: string; started?: number; prepared?: PreparedClaudeUpload } = {}
): Promise<Record<string, unknown>> {
  const started = options.started || Date.now();
  let effective: Record<string, any> = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  let files: ClaudeUploadRpcFile[] = [];
  let attachmentNames: string[] = [];
  let conversationId: string | undefined;
  let modelUsed: string | null = normalizeClaudeModel(effective.model);
  let httpStatus: number | null = null;
  let uploadedCount = 0;
  try {
    const prepared = options.prepared || preparedClaudeUpload(args || {});
    effective = prepared.effective;
    files = prepared.files;
    attachmentNames = files.map((file) => file.fileName);
    modelUsed = normalizeClaudeModel(effective.model);
    const orgId = String(options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId || "").trim();
    if (!UUID_RE.test(orgId)) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC upload");
    conversationId = effectiveConversationId(effective, options.conversationId);
    const parentMessageUuid = options.parentMessageUuid || parentMessageUuidFromArgs(effective);
    if (effective.reuse_conversation && !parentMessageUuid) {
      throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude RPC reuse_conversation requires parent_message_uuid");
    }

    const uploads: UploadResponseRecord[] = [];
    for (const file of files) {
      const uploadStarted = Date.now();
      const response = await fetchRpc({
        kind: "upload",
        url: uploadFileUrl(orgId, conversationId),
        profile: String(effective.profile),
        timeoutMs: uploadTimeoutMs(effective),
        file
      });
      httpStatus = response.status;
      void uploadStarted;
      uploads.push(parseUploadJson(response, file));
      uploadedCount += 1;
    }

    const payload = buildClaudeUploadCompletionPayload(
      { ...effective, organization_id: orgId, conversation_id: conversationId, ...(parentMessageUuid ? { parent_message_uuid: parentMessageUuid } : {}) },
      files,
      uploads
    );
    const requestBody = JSON.stringify(payload);
    const completionStarted = Date.now();
    const completion = await fetchRpc({
      kind: "completion",
      url: completionUrl(orgId, conversationId),
      profile: String(effective.profile),
      timeoutMs: responseTimeoutMs(effective),
      body: requestBody
    });
    httpStatus = completion.status;
    const waitMs = completion.elapsedMs ?? (Date.now() - completionStarted);
    if (completion.status !== 200) {
      const code = httpStatusErrorCode(completion.status, completion.text || "");
      return uploadRpcErrorOutput(effective, started, new WebAiToolError(code, `Claude RPC completion returned HTTP ${completion.status}`), {
        chat_url: chatUrl(conversationId),
        conversation_id: conversationId,
        model_used: modelUsed,
        http_status: completion.status,
        files_uploaded_count: uploadedCount,
        attachment_names: attachmentNames
      });
    }
    const decoded = decodeClaudeRpcSseEnvelope(completion.text);
    const responseText = decoded.responseText;
    modelUsed = decoded.modelUsed || modelUsed;
    if (!responseText.trim()) {
      throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "Claude RPC completion finished without assistant text");
    }
    return safeOutput(uploadRpcBase(chatUrl(conversationId), started, {
      response_text: responseText,
      wait_ms: waitMs,
      completion_detected: true,
      errorCode: null,
      model_used: modelUsed,
      http_status: completion.status,
      files_uploaded_count: uploadedCount,
      attachment_names: attachmentNames
    }));
  } catch (error: any) {
    return uploadRpcErrorOutput(effective, started, error, {
      ...(conversationId ? { chat_url: chatUrl(conversationId), conversation_id: conversationId } : {}),
      model_used: modelUsed,
      http_status: httpStatus,
      files_uploaded_count: uploadedCount,
      attachment_names: attachmentNames
    });
  }
}

async function fetchClaudeUploadRpcInPage(page: any, request: ClaudeUploadRpcRequest): Promise<ClaudeUploadRpcFetchResult> {
  const started = Date.now();
  if (request.kind === "upload") {
    if (!request.file) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "Claude upload fetch requires file metadata");
    const result = await page.evaluate(async ({ url, file, timeoutMs }: { url: string; file: ClaudeUploadRpcFile; timeoutMs: number }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      try {
        const binary = atob(file.base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const blob = new Blob([bytes], { type: file.mimeType || "application/octet-stream" });
        const formData = new FormData();
        formData.append("file", blob, file.fileName);
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { accept: "application/json, text/plain, */*" },
          body: formData,
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
    }, { url: request.url, file: request.file, timeoutMs: request.timeoutMs });
    return { ...result, elapsedMs: Date.now() - started };
  }

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
  }, { url: request.url, body: request.body || "", timeoutMs: request.timeoutMs });
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

export async function webAiClaudeUploadAndQueryRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const started = Date.now();
  let prepared: PreparedClaudeUpload;
  try {
    prepared = preparedClaudeUpload(args || {});
  } catch (error: any) {
    return uploadRpcErrorOutput({ ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE }, started, error);
  }
  const effective = prepared.effective;
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) {
      return uploadRpcErrorOutput(effective, started, new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before upload"), { chat_url: String(page.url?.() || targetUrlForClaude(effective)) });
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
    return await webAiClaudeUploadAndQueryRpcWithFetch(
      { ...effective, organization_id: orgId, ...(conversationId ? { conversation_id: conversationId } : {}), ...(parentMessageUuid ? { parent_message_uuid: parentMessageUuid } : {}) },
      (request) => fetchClaudeUploadRpcInPage(page, request),
      { orgId, conversationId, parentMessageUuid, started, prepared }
    );
  } catch (error: any) {
    return uploadRpcErrorOutput(effective, started, error);
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
