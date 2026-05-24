/**
 * Chrome Native Messaging framing uses a 4-byte little-endian unsigned length
 * prefix followed by one UTF-8 JSON payload. `encode()` returns one complete
 * frame; `decode()` consumes zero or more complete frames and returns the
 * unconsumed trailing bytes so callers can reassemble chunked stdio reads.
 */
import { EventEmitter } from "node:events";
import { spawn as defaultSpawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { BridgeMethod, BridgeRequest, BridgeResponse } from "./protocol";
import { ConsumerErrorCode, isConsumerErrorCode } from "../../consumer/errorCodes";

export type NativeMessagingClientMode = "spawn-host" | "chrome-bridged";

export interface ChromeBridgeTransport {
  request(request: BridgeRequest, timeoutMs: number): Promise<BridgeResponse>;
  dispose?(): Promise<void> | void;
}

export interface NativeMessagingClientOptions {
  mode?: NativeMessagingClientMode;
  hostPath?: string;
  hostArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  bootstrapTimeoutMs?: number;
  chromeBridge?: ChromeBridgeTransport;
  spawn?: typeof defaultSpawn;
}

export interface NativeMessagingRequestOptions {
  timeoutMs?: number;
}

export interface NativeMessagingConnectOptions {
  heartbeat?: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export interface DecodedNativeMessages<T = unknown> {
  messages: T[];
  remaining: Buffer;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;
const NOT_CONNECTED_CODE: ConsumerErrorCode = "CHROME_EXTENSION_NOT_CONNECTED";

function timeoutFromEnv(): number {
  const raw = process.env.CHROME_EXTENSION_DISPATCH_TIMEOUT;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

function normalizeTimeout(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function encodeNativeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function decodeNativeMessages<T = unknown>(buffer: Buffer): DecodedNativeMessages<T> {
  const messages: T[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = (buffer as any).readUInt32LE(offset);
    if (length <= 0 || length > MAX_NATIVE_MESSAGE_BYTES) {
      throw new Error(`Invalid Chrome Native Messaging frame length: ${length}`);
    }
    const frameStart = offset + 4;
    const frameEnd = frameStart + length;
    if (buffer.length < frameEnd) break;
    const raw = (buffer as any).toString("utf8", frameStart, frameEnd);
    messages.push(JSON.parse(raw) as T);
    offset = frameEnd;
  }
  return { messages, remaining: (buffer as any).subarray(offset) as Buffer };
}

export const encode = encodeNativeMessage;
export const decode = decodeNativeMessages;

export class NativeMessagingBridgeError extends Error {
  readonly errorCode: ConsumerErrorCode;
  readonly details?: unknown;

  constructor(errorCode: ConsumerErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "NativeMessagingBridgeError";
    this.errorCode = errorCode;
    this.details = details;
  }
}

function bridgeError(errorCode: ConsumerErrorCode, message: string, details?: unknown): NativeMessagingBridgeError {
  return new NativeMessagingBridgeError(errorCode, message, details);
}

function bridgeErrorFromResponse(response: BridgeResponse): NativeMessagingBridgeError {
  const error = response.error;
  const rawCode = typeof error?.code === "string" ? error.code : undefined;
  const dataCode = (error?.data && typeof error.data === "object" && "errorCode" in error.data)
    ? (error.data as any).errorCode
    : undefined;
  const code = isConsumerErrorCode(rawCode) ? rawCode
    : isConsumerErrorCode(dataCode) ? dataCode
      : NOT_CONNECTED_CODE;
  return bridgeError(code, error?.message || "Chrome extension bridge request failed", error?.data);
}

export class NativeMessagingClient extends EventEmitter {
  readonly mode: NativeMessagingClientMode;
  private readonly hostPath?: string;
  private readonly hostArgs: string[];
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly bootstrapTimeoutMs: number;
  private readonly chromeBridge?: ChromeBridgeTransport;
  private readonly spawnImpl: typeof defaultSpawn;
  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = Buffer.alloc(0);
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  private disposed = false;

  constructor(options: NativeMessagingClientOptions = {}) {
    super();
    this.mode = options.mode || "spawn-host";
    this.hostPath = options.hostPath || process.env.CHROME_EXTENSION_NATIVE_HOST_PATH;
    this.hostArgs = options.hostArgs || [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.timeoutMs = normalizeTimeout(options.timeoutMs, timeoutFromEnv());
    this.bootstrapTimeoutMs = normalizeTimeout(options.bootstrapTimeoutMs, this.timeoutMs);
    this.chromeBridge = options.chromeBridge;
    this.spawnImpl = options.spawn || defaultSpawn;
  }

  async connect(options: NativeMessagingConnectOptions = {}): Promise<void> {
    if (this.disposed) throw bridgeError(NOT_CONNECTED_CODE, "Chrome extension bridge client has been disposed");
    if (this.mode === "chrome-bridged") {
      if (!this.chromeBridge) {
        const error = bridgeError(NOT_CONNECTED_CODE, "Chrome extension bridge transport is not connected");
        this.emitNotConnected(error);
        throw error;
      }
      if (options.heartbeat !== false) await this.ping({ timeoutMs: this.bootstrapTimeoutMs });
      return;
    }

    if (!this.child) {
      if (!this.hostPath) {
        const error = bridgeError(NOT_CONNECTED_CODE, "Native messaging host path is required in spawn-host mode");
        this.emitNotConnected(error);
        throw error;
      }
      this.child = this.spawnImpl(this.hostPath, this.hostArgs, {
        cwd: this.cwd,
        env: this.env || process.env,
        stdio: "pipe",
        windowsHide: true
      });
      this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
      this.child.once("exit", (code, signal) => this.handleChildExit(code, signal));
      this.child.once("error", (error) => this.handleChildError(error));
    }

    if (options.heartbeat !== false) await this.ping({ timeoutMs: this.bootstrapTimeoutMs });
  }

  async ping(options: NativeMessagingRequestOptions = {}): Promise<unknown> {
    return this.request("browser.ping", {}, options);
  }

  async request<TParams = unknown, TResult = unknown>(
    method: BridgeMethod,
    params?: TParams,
    options: NativeMessagingRequestOptions = {}
  ): Promise<TResult> {
    if (this.disposed) throw bridgeError(NOT_CONNECTED_CODE, "Chrome extension bridge client has been disposed");
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.timeoutMs);
    const id = this.nextId++;
    const request: BridgeRequest<TParams> = { jsonrpc: "2.0", id, method, params };

    if (this.mode === "chrome-bridged") {
      if (!this.chromeBridge) {
        const error = bridgeError(NOT_CONNECTED_CODE, "Chrome extension bridge transport is not connected");
        this.emitNotConnected(error);
        throw error;
      }
      const response = await this.withTimeout(this.chromeBridge.request(request, timeoutMs), timeoutMs, id);
      if (response.error) throw bridgeErrorFromResponse(response);
      return response.result as TResult;
    }

    if (!this.child) await this.connect({ heartbeat: false });
    if (!this.child || !this.child.stdin.writable) {
      const error = bridgeError(NOT_CONNECTED_CODE, "Native messaging host process is not writable");
      this.emitNotConnected(error);
      throw error;
    }

    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        const error = bridgeError(NOT_CONNECTED_CODE, `Chrome extension bridge request ${String(id)} timed out after ${timeoutMs}ms`, { method });
        this.emitNotConnected(error);
        reject(error);
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
      this.child!.stdin.write(encodeNativeMessage(request), (error?: Error | null) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        const bridge = bridgeError(NOT_CONNECTED_CODE, `Failed to write native messaging request: ${error.message}`, { method });
        this.emitNotConnected(bridge);
        reject(bridge);
      });
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const error = bridgeError(NOT_CONNECTED_CODE, "Chrome extension bridge client disposed");
    this.rejectAll(error);
    await this.chromeBridge?.dispose?.();
    if (this.child) {
      const child = this.child;
      this.child = undefined;
      child.stdin.destroy();
      if (!child.killed) child.kill();
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, id: string | number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = bridgeError(NOT_CONNECTED_CODE, `Chrome extension bridge request ${String(id)} timed out after ${timeoutMs}ms`);
            this.emitNotConnected(error);
            reject(error);
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private handleStdout(chunk: Buffer): void {
    try {
      const decoded = decodeNativeMessages<BridgeResponse>(Buffer.concat([this.stdoutBuffer, chunk]));
      this.stdoutBuffer = decoded.remaining;
      for (const message of decoded.messages) this.handleResponse(message);
    } catch (error) {
      const bridge = bridgeError(NOT_CONNECTED_CODE, `Failed to decode native messaging response: ${error instanceof Error ? error.message : String(error)}`);
      this.emitNotConnected(bridge);
      this.rejectAll(bridge);
    }
  }

  private handleResponse(response: BridgeResponse): void {
    const id = response.id;
    if (id === null || id === undefined) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (response.error) pending.reject(bridgeErrorFromResponse(response));
    else pending.resolve(response.result);
  }

  private handleChildExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.child = undefined;
    const error = bridgeError(NOT_CONNECTED_CODE, `Native messaging host exited before completing bridge requests (code=${code ?? "null"}, signal=${signal ?? "null"})`, { code, signal });
    this.emitNotConnected(error);
    this.rejectAll(error);
  }

  private handleChildError(error: Error): void {
    const bridge = bridgeError(NOT_CONNECTED_CODE, `Native messaging host process error: ${error.message}`);
    this.emitNotConnected(bridge);
    this.rejectAll(bridge);
  }

  private rejectAll(error: NativeMessagingBridgeError): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  private emitNotConnected(error: NativeMessagingBridgeError): void {
    this.emit("errorCode", NOT_CONNECTED_CODE, error);
    this.emit(NOT_CONNECTED_CODE, error);
  }
}
