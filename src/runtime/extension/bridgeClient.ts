import { BridgeMethod } from "./protocol";

export interface BridgeRequestOptions {
  timeoutMs?: number;
}

export interface BridgeConnectOptions {
  heartbeat?: boolean;
}

export interface BridgeClient {
  connect?(options?: BridgeConnectOptions): Promise<void>;
  ping(options?: BridgeRequestOptions): Promise<unknown>;
  request<TParams = unknown, TResult = unknown>(
    method: BridgeMethod,
    params?: TParams,
    options?: BridgeRequestOptions
  ): Promise<TResult>;
  dispose(): Promise<void>;
}
