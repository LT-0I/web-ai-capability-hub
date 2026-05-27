const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { chromium } from "playwright";

import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../consumer/errorCodes";
import { assertPromptAllowed, PromptPolicyDeniedError } from "../safety/promptDeny";
import { assertNotPublishDeniedLabel } from "../safety/publishDeny";
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
const UNSUPPORTED_GENERATE_FILE_EXTS = new Set(["xlsx"]);

export interface ClaudeGenerateFileRpcRequest {
  kind: "completion" | "download";
  url: string;
  profile: string;
  timeoutMs: number;
  body?: string;
  remotePath?: string;
}

export interface ClaudeGenerateFileRpcFetchResult {
  status: number;
  statusText?: string;
  contentType?: string | null;
  text: string;
  base64?: string;
  url?: string;
  elapsedMs?: number;
  headers?: Record<string, string>;
}

export type ClaudeGenerateFileRpcFetch = (request: ClaudeGenerateFileRpcRequest) => Promise<ClaudeGenerateFileRpcFetchResult>;

interface ExtractedArtifact {
  content: string;
  remotePath?: string;
  fileName?: string;
  source: "create_file" | "widget" | "display_content";
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
  return normalizeUrlLikeTarget(args?.url) || normalizeUrlLikeTarget(args?.tab_url_contains) || CLAUDE_FRESH_URL;
}

function responseTimeoutMs(args: any): number {
  const value = Number(args?.response_timeout_ms ?? args?.responseTimeoutMs ?? args?.timeout_ms ?? args?.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESPONSE_TIMEOUT_MS;
}

function requireAbsoluteDir(downloadDir: string): void {
  if (!path.isAbsolute(downloadDir)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "download_dir must be an absolute path");
  fs.mkdirSync(downloadDir, { recursive: true });
}

function normalizedExpectedExtension(value: unknown): string {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
}

function sha256Buffer(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(name: string, extension: string): string {
  const cleaned = path.basename(String(name || "")).replace(/[^a-zA-Z0-9._ -]+/g, "_").trim();
  const fallback = `claude-artifact-${Date.now()}.${extension}`;
  const withExt = cleaned || fallback;
  return withExt.toLowerCase().endsWith(`.${extension}`) ? withExt : `${withExt}.${extension}`;
}

function fileErrorOutput(errorCode: ConsumerErrorCode, message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({
    path: "",
    sha256: "",
    size_bytes: 0,
    artifact_name: "",
    download_filename: "",
    errorCode,
    error_code: errorCode,
    message,
    ...extra
  });
}

function successOutput(filePath: string, artifactName: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const bytes = fs.readFileSync(filePath);
  return safeOutput({
    path: filePath,
    sha256: sha256Buffer(bytes),
    size_bytes: bytes.length,
    artifact_name: artifactName,
    download_filename: path.basename(filePath),
    ...extra,
    errorCode: null
  });
}

function claudeGenerateFileRpcErrorCode(error: any): ConsumerErrorCode {
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

function conversationIdFromUrl(url: string): string | undefined {
  const match = /\/(?:chat|c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(url);
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

function downloadFileUrl(orgId: string, conversationId: string, remotePath: string): string {
  return `https://claude.ai/api/organizations/${orgId}/conversations/${conversationId}/wiggle/download-file?path=${encodeURIComponent(remotePath)}`;
}

function contentDispositionFileName(headers?: Record<string, string>): string | undefined {
  const value = headers?.["content-disposition"] || headers?.["Content-Disposition"] || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (star) {
    try { return decodeURIComponent(star); } catch { return star; }
  }
  const quoted = /filename="([^"]+)"/i.exec(value)?.[1] || /filename=([^;]+)/i.exec(value)?.[1];
  return quoted ? quoted.trim() : undefined;
}

function parseJsonMaybe(value: string): any | null {
  try { return JSON.parse(value); } catch { return null; }
}

function maybeArtifactFromDisplayContent(displayContent: any): ExtractedArtifact | null {
  const jsonBlock = typeof displayContent?.json_block === "string" ? displayContent.json_block : "";
  const parsed = jsonBlock ? parseJsonMaybe(jsonBlock) : null;
  if (!parsed || typeof parsed !== "object") return null;
  const content = typeof parsed.code === "string" ? parsed.code : typeof parsed.file_text === "string" ? parsed.file_text : "";
  if (!content) return null;
  const fileName = typeof parsed.filename === "string" ? path.basename(parsed.filename) : undefined;
  const remotePath = typeof parsed.filename === "string" && parsed.filename.startsWith("/") ? parsed.filename : undefined;
  return { content, fileName, remotePath, source: "display_content" };
}

export function extractClaudeGeneratedFileArtifacts(streamText: string): ExtractedArtifact[] {
  const blocks = new Map<number, { name?: string; partial: string; artifacts: ExtractedArtifact[] }>();
  const artifacts: ExtractedArtifact[] = [];
  const blockFor = (index: number) => {
    let block = blocks.get(index);
    if (!block) {
      block = { partial: "", artifacts: [] };
      blocks.set(index, block);
    }
    return block;
  };
  for (const chunk of String(streamText || "").split(/\r?\n\r?\n+/)) {
    const dataLines = chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") continue;
    const event = parseJsonMaybe(data);
    if (!event || typeof event !== "object") continue;
    const index = Number(event.index ?? 0);
    if (event.type === "content_block_start" && event.content_block) {
      const block = blockFor(index);
      block.name = event.content_block.name || event.content_block.type;
      const displayArtifact = maybeArtifactFromDisplayContent(event.content_block.display_content);
      if (displayArtifact) block.artifacts.push(displayArtifact);
    }
    if (event.type === "content_block_delta" && event.delta) {
      const block = blockFor(index);
      if (event.delta.type === "input_json_delta" && typeof event.delta.partial_json === "string") block.partial += event.delta.partial_json;
      const displayArtifact = maybeArtifactFromDisplayContent(event.delta.display_content);
      if (displayArtifact) block.artifacts.push(displayArtifact);
    }
    if (event.type === "content_block_stop") {
      const block = blockFor(index);
      for (const artifact of block.artifacts) artifacts.push(artifact);
      const parsed = block.partial ? parseJsonMaybe(block.partial) : null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.file_text === "string" || typeof parsed.code === "string") {
          const content = String(parsed.file_text ?? parsed.code ?? "");
          const remotePath = typeof parsed.path === "string" ? parsed.path : undefined;
          const fileName = remotePath ? path.basename(remotePath) : (typeof parsed.filename === "string" ? path.basename(parsed.filename) : undefined);
          artifacts.push({ content, remotePath, fileName, source: "create_file" });
        } else if (typeof parsed.widget_code === "string") {
          const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "claude-widget";
          artifacts.push({ content: parsed.widget_code, fileName: `${title}.html`, source: "widget" });
        }
      }
      blocks.delete(index);
    }
  }
  return artifacts.filter((artifact) => typeof artifact.content === "string" && (artifact.content.length > 0 || artifact.remotePath));
}

export function buildClaudeGenerateFilePayload(args: any): Record<string, unknown> {
  return buildClaudeRpcPayload(args);
}

function chooseArtifact(artifacts: ExtractedArtifact[], expectedExtension: string): ExtractedArtifact | null {
  const matching = artifacts.find((artifact) => artifact.fileName && artifact.fileName.toLowerCase().endsWith(`.${expectedExtension}`));
  if (matching) return matching;
  if (expectedExtension === "html") return artifacts.find((artifact) => artifact.source === "widget") || artifacts[0] || null;
  return artifacts[0] || null;
}

function writeStreamedArtifact(artifact: ExtractedArtifact, downloadDir: string, expectedExtension: string): string {
  const fileName = safeFileName(artifact.fileName || `claude-artifact.${expectedExtension}`, expectedExtension);
  const filePath = path.join(downloadDir, fileName);
  fs.writeFileSync(filePath, artifact.content, "utf8");
  return filePath;
}

function writeDownloadedArtifact(response: ClaudeGenerateFileRpcFetchResult, artifact: ExtractedArtifact, downloadDir: string, expectedExtension: string): string {
  const fileName = safeFileName(contentDispositionFileName(response.headers) || artifact.fileName || path.basename(String(artifact.remotePath || "")) || `claude-artifact.${expectedExtension}`, expectedExtension);
  const filePath = path.join(downloadDir, fileName);
  const bytes = response.base64 ? Buffer.from(response.base64, "base64") : Buffer.from(response.text || "", "utf8");
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

export async function webAiClaudeGenerateFileRpcWithFetch(
  args: any,
  fetchRpc: ClaudeGenerateFileRpcFetch,
  options: { orgId?: string; conversationId?: string; started?: number } = {}
): Promise<Record<string, unknown>> {
  const started = options.started || Date.now();
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  const expectedExtension = normalizedExpectedExtension(effective.expected_extension);
  let conversationId: string | undefined;
  let httpStatus: number | null = null;
  try {
    if (!effective.prompt || typeof effective.prompt !== "string") throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_claude_generate_file requires a string prompt");
    if (!expectedExtension) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, "expected_extension is required");
    if (UNSUPPORTED_GENERATE_FILE_EXTS.has(expectedExtension)) throw new WebAiToolError(ConsumerErrorCodes.INVALID_ARGS, `expected_extension="${expectedExtension}" is not supported on webai_claude_generate_file: native downloadable .xlsx generation is not reliably produced by the claude RPC path.`);
    assertPromptAllowed(effective.prompt);
    requireAbsoluteDir(effective.download_dir);
    assertNotPublishDeniedLabel("Download", { tool: "webai.claude.generate_file" });
    const orgId = String(options.orgId || effective.organization_id || effective.organizationId || effective.org_id || effective.orgId || "").trim();
    if (!UUID_RE.test(orgId)) throw new WebAiToolError(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude active organization is required for RPC generate_file");
    conversationId = effectiveConversationId(effective, options.conversationId);
    const requestBody = JSON.stringify(buildClaudeGenerateFilePayload({ ...effective, organization_id: orgId, conversation_id: conversationId }));
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
      return fileErrorOutput(code, `Claude RPC completion returned HTTP ${completion.status}`, { http_status: completion.status, conversation_id: conversationId, chat_url: `https://claude.ai/chat/${conversationId}` });
    }
    const decoded = decodeClaudeRpcSseEnvelope(completion.text);
    const artifacts = extractClaudeGeneratedFileArtifacts(completion.text);
    const artifact = chooseArtifact(artifacts, expectedExtension);
    if (!artifact) throw new WebAiToolError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, "Claude RPC completion did not stream a downloadable or inline artifact payload");
    let savedPath: string;
    if (artifact.remotePath) {
      const download = await fetchRpc({
        kind: "download",
        url: downloadFileUrl(orgId, conversationId, artifact.remotePath),
        profile: String(effective.profile),
        timeoutMs: Math.min(responseTimeoutMs(effective), 120000),
        remotePath: artifact.remotePath
      });
      httpStatus = download.status;
      if (download.status >= 200 && download.status < 300) savedPath = writeDownloadedArtifact(download, artifact, effective.download_dir, expectedExtension);
      else {
        const code = httpStatusErrorCode(download.status, download.text || "");
        return fileErrorOutput(code, `Claude RPC artifact download returned HTTP ${download.status}`, { http_status: download.status, conversation_id: conversationId, chat_url: `https://claude.ai/chat/${conversationId}` });
      }
    } else {
      savedPath = writeStreamedArtifact(artifact, effective.download_dir, expectedExtension);
    }
    return successOutput(savedPath, path.basename(savedPath), {
      wait_ms: waitMs,
      http_status: httpStatus,
      conversation_id: conversationId,
      chat_url: `https://claude.ai/chat/${conversationId}`,
      response_text: decoded.responseText,
      artifact_source: artifact.source
    });
  } catch (error: any) {
    const code = claudeGenerateFileRpcErrorCode(error);
    return fileErrorOutput(code, errorMessageFromUnknown(error, code), {
      ...(conversationId ? { conversation_id: conversationId, chat_url: `https://claude.ai/chat/${conversationId}` } : {}),
      http_status: httpStatus
    });
  }
}

async function fetchClaudeGenerateFileRpcInPage(page: any, request: ClaudeGenerateFileRpcRequest): Promise<ClaudeGenerateFileRpcFetchResult> {
  const started = Date.now();
  if (request.kind === "download") {
    const result = await page.evaluate(async ({ url, timeoutMs }: { url: string; timeoutMs: number }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      try {
        const response = await fetch(url, { method: "GET", credentials: "include", headers: { accept: "*/*" }, signal: controller.signal });
        const buffer = await response.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => { headers[key] = value; });
        return { status: response.status, statusText: response.statusText, contentType: response.headers.get("content-type"), url: response.url, text: "", base64: btoa(binary), headers };
      } finally { clearTimeout(timer); }
    }, { url: request.url, timeoutMs: request.timeoutMs });
    return { ...result, elapsedMs: Date.now() - started };
  }
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
    try { const parsed = new URL(url); return parsed.hostname === "claude.ai" || parsed.hostname === "www.claude.ai"; } catch { return false; }
  };
  let page = pages.find((candidate: any) => isClaude(String(candidate.url?.() || "")));
  if (!page) page = await context.newPage();
  const target = targetUrlForClaude(args);
  const currentUrl = String(page.url?.() || "");
  if (!isClaude(currentUrl) || !/\/new|\/chat\//.test(new URL(target).pathname)) {
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

export async function webAiClaudeGenerateFileRpc(args: any, runtime?: BrowserToolRuntime): Promise<unknown> {
  const effective = { ...(args || {}), profile: args?.profile || DEFAULT_CLAUDE_PROFILE };
  let lease: string | undefined;
  let browser: any;
  try {
    lease = acquireProfileLease(String(effective.profile));
    browser = await connectBrowserForProfile(effective, runtime);
    const page = await claudeOriginPage(browser, effective);
    if (loginRequiredForService("claude", String(page.url?.() || ""))) return fileErrorOutput(ConsumerErrorCodes.LOGIN_REQUIRED, "Claude login is required before generate_file", { chat_url: String(page.url?.() || targetUrlForClaude(effective)) });
    const orgId = await activeClaudeOrgId(page, effective);
    const pageConversationId = conversationIdFromUrl(String(page.url?.() || ""));
    const reusePageConversation = Boolean(effective.reuse_conversation || effective.conversation_id || effective.conversationId || /\/(?:chat|c)\//i.test(String(effective.url || effective.tab_url_contains || "")));
    const conversationId = reusePageConversation ? pageConversationId : undefined;
    return await webAiClaudeGenerateFileRpcWithFetch(
      { ...effective, organization_id: orgId, ...(conversationId ? { conversation_id: conversationId } : {}) },
      (request) => fetchClaudeGenerateFileRpcInPage(page, request),
      { orgId, conversationId }
    );
  } catch (error: any) {
    const code = claudeGenerateFileRpcErrorCode(error);
    return fileErrorOutput(code, errorMessageFromUnknown(error, code));
  } finally {
    await browser?.close?.().catch?.(() => undefined);
    if (lease) releaseProfileLease(String(effective.profile), lease);
  }
}
