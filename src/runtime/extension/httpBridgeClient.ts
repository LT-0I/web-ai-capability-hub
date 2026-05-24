import { BridgeClient, BridgeRequestOptions } from "./bridgeClient";
import { BridgeMethod, BridgeResponse } from "./protocol";
import { NativeMessagingBridgeError } from "./nativeMessagingClient";
import { ConsumerErrorCode, ConsumerErrorCodes, isConsumerErrorCode } from "../../consumer/errorCodes";

const DEFAULT_NATIVE_SERVER_PORT = 12306;
const DEFAULT_TIMEOUT_MS = 30_000;
const MCP_PROTOCOL_VERSION = "2024-11-05";

export const EXTENSION_HTTP_PORT_FOR_PROFILE: Record<string, number> = {
  chatgpt: 12306,
  "claude-9224": 12307,
  claude: 12307,
  gemini: 12308,
  "gemini-9225": 12308,
};

export function defaultHttpBridgeUrlForProfile(profile: string | undefined): string {
  const port = profile && EXTENSION_HTTP_PORT_FOR_PROFILE[profile];
  return `http://127.0.0.1:${port || DEFAULT_NATIVE_SERVER_PORT}/mcp`;
}

export interface HttpBridgeClientOptions {
  httpBridgeUrl?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface JsonRpcEnvelope {
  jsonrpc?: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: string | number;
    message?: string;
    data?: unknown;
  };
}

function timeoutFromEnv(): number {
  const raw = process.env.CHROME_EXTENSION_DISPATCH_TIMEOUT;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

function normalizeTimeout(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function defaultBaseUrl(): string {
  const rawPort = process.env.CHROME_MCP_PORT || process.env.MCP_HTTP_PORT;
  const parsed = rawPort ? Number.parseInt(String(rawPort), 10) : NaN;
  const port = Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_NATIVE_SERVER_PORT;
  return `http://127.0.0.1:${port}`;
}

function normalizeMcpUrl(options: HttpBridgeClientOptions): URL {
  const raw = options.httpBridgeUrl || options.baseUrl || process.env.CHROME_EXTENSION_HTTP_BRIDGE_URL || defaultBaseUrl();
  const url = new URL(raw);
  if (!url.pathname || url.pathname === "/") url.pathname = "/mcp";
  return url;
}

function pingUrlFor(mcpUrl: URL): URL {
  const url = new URL(mcpUrl.toString());
  url.pathname = "/ping";
  url.search = "";
  return url;
}

function bodyTextFrom(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    const errorCode = (value as any).errorCode;
    if (isConsumerErrorCode(errorCode)) return String(errorCode);
    const message = (value as any).message || (value as any).error;
    if (typeof message === "string") return message;
    const content = (value as any).content;
    if (Array.isArray(content)) {
      return content
        .map((item) => typeof item?.text === "string" ? item.text : "")
        .filter(Boolean)
        .join("\n");
    }
  }
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function classifyChromeExtensionBridgeError(value: unknown): ConsumerErrorCode {
  const fromObject = value && typeof value === "object" ? (value as any) : undefined;
  const explicit = fromObject?.errorCode || fromObject?.code || fromObject?.data?.errorCode;
  if (isConsumerErrorCode(explicit)) return explicit;

  const text = bodyTextFrom(value);
  if (/\b(debugger|debuggee)\b|already attached|another debugger|cannot attach|failed to attach|devtools/i.test(text)) {
    return ConsumerErrorCodes.CHROME_EXTENSION_DEBUGGER_UNAVAILABLE;
  }
  if (/\b(permission|permissions)\b|not allowed|missing (?:host )?permission|cannot access contents of url|activeTab|chrome\.scripting|chrome\.tabs|chrome\.downloads|chrome\.debugger/i.test(text)) {
    return ConsumerErrorCodes.CHROME_EXTENSION_PERMISSION_DENIED;
  }
  return ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED;
}

function bridgeError(value: unknown, fallbackMessage: string, details?: unknown): NativeMessagingBridgeError {
  const code = classifyChromeExtensionBridgeError(value);
  const message = bodyTextFrom(value) || fallbackMessage;
  return new NativeMessagingBridgeError(code, message, details ?? value);
}

function parseMaybeEventStream(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const dataLine = trimmed
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));
  if (dataLine) return JSON.parse(dataLine.replace(/^data:\s*/, ""));
  return { message: trimmed };
}

export class HttpBridgeClient implements BridgeClient {
  private readonly mcpUrl: URL;
  private readonly pingUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private sessionId?: string;
  private nextId = 1;
  private disposed = false;

  constructor(options: HttpBridgeClientOptions = {}) {
    this.mcpUrl = normalizeMcpUrl(options);
    this.pingUrl = pingUrlFor(this.mcpUrl);
    this.timeoutMs = normalizeTimeout(options.timeoutMs, timeoutFromEnv());
    this.fetchImpl = options.fetch || fetch;
  }

  async connect(): Promise<void> {
    await this.ensureInitialized(this.timeoutMs);
  }

  async ping(options: BridgeRequestOptions = {}): Promise<unknown> {
    this.assertUsable();
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.timeoutMs);
    const response = await this.fetchWithTimeout(this.pingUrl, { method: "GET" }, timeoutMs);
    if (!response.ok) throw bridgeError({ message: `Chrome extension native-server ping failed with HTTP ${response.status}` }, "Chrome extension native-server is not reachable", { status: response.status });
    return this.readResponse(response);
  }

  async request<TParams = unknown, TResult = unknown>(
    method: BridgeMethod,
    params?: TParams,
    options: BridgeRequestOptions = {}
  ): Promise<TResult> {
    this.assertUsable();
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.timeoutMs);
    if (method === "browser.ping") return await this.ping({ timeoutMs }) as TResult;
    await this.ensureInitialized(timeoutMs);

    const envelope = await this.postJson<JsonRpcEnvelope>({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: {
        name: method,
        arguments: params || {}
      }
    }, timeoutMs, this.sessionId);

    if (envelope?.error) throw bridgeError(envelope.error, "Chrome extension HTTP bridge request failed", envelope.error.data);
    const toolResult = envelope?.result ?? envelope;
    if (toolResult && typeof toolResult === "object" && (toolResult as any).isError) {
      throw bridgeError(toolResult, "Chrome extension tool call failed", toolResult);
    }
    return toolResult as TResult;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    if (!sessionId) return;
    await this.fetchWithTimeout(this.mcpUrl, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId, accept: "application/json" }
    }, 2_000).catch(() => undefined);
  }

  private async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.sessionId) return;
    const response = await this.postJson<JsonRpcEnvelope>({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "web-ai-capability-hub", version: "1.0.0" }
      }
    }, timeoutMs);

    if (response?.error) throw bridgeError(response.error, "Chrome extension MCP initialize failed", response.error.data);
    if (!this.sessionId) {
      throw bridgeError({ message: "Chrome extension native-server did not return an MCP session id" }, "Chrome extension MCP session was not established");
    }

    await this.postJson({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    }, timeoutMs, this.sessionId).catch(() => undefined);
  }

  private async postJson<T>(body: unknown, timeoutMs: number, sessionId?: string): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await this.fetchWithTimeout(this.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }, timeoutMs);
    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) this.sessionId = sessionHeader;
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw bridgeError({ message: `Chrome extension native-server HTTP ${response.status}${bodyText ? `: ${bodyText}` : ""}` }, "Chrome extension HTTP bridge request failed", { status: response.status, body: bodyText });
    }
    return await this.readResponse(response) as T;
  }

  private async readResponse(response: Response): Promise<unknown> {
    if (response.status === 202 || response.status === 204) return {};
    const text = await response.text();
    try { return parseMaybeEventStream(text); }
    catch (error) { throw bridgeError(error, "Chrome extension HTTP bridge returned invalid JSON", { body: text }); }
  }

  private async fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw bridgeError(error, "Chrome extension native-server is not reachable", { url: url.toString() });
    } finally {
      clearTimeout(timer);
    }
  }

  private assertUsable(): void {
    if (this.disposed) throw bridgeError({ message: "Chrome extension HTTP bridge client has been disposed" }, "Chrome extension HTTP bridge client has been disposed");
  }
}

export function createHttpBridgeClient(options: HttpBridgeClientOptions = {}): HttpBridgeClient {
  return new HttpBridgeClient(options);
}
