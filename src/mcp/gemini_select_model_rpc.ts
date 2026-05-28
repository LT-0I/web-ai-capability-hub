import { ConsumerErrorCode, ConsumerErrorCodes } from "../consumer/errorCodes";
import {
  acquireProfileLease,
  BrowserToolRuntime,
  releaseProfileLease,
  safeOutput
} from "./tools";
import {
  buildGeminiBatchRpcRequest,
  captureGeminiBatchRpcSnapshot,
  defaultGeminiBatchRpcFetch,
  errorMessageFromUnknown,
  GeminiBatchRpcFetch,
  GeminiBatchRpcSnapshot,
  GeminiBatchRpcToolError,
  geminiBatchRpcErrorCode,
  loadGeminiBatchRpcPayloadTemplate,
  runGeminiBatchRpcRequest,
  targetUrlForGeminiBatchRpc
} from "./gemini_workspace_rpc";

const GEMINI_PROFILE = "gemini-9225";
const GEMINI_CHAT_URL = "https://gemini.google.com/app";

type GeminiSelectModelRpcVariant = "select_flash" | "select_flash_lite" | "select_pro" | "thinking_standard" | "thinking_extended";

type GeminiSelectModelResolution = {
  variant: GeminiSelectModelRpcVariant;
  selectedModel: string | null;
  selectedThinkingLevel: string | null;
};

function nowMs(args: any): number {
  return typeof args?.__now === "function" ? Number(args.__now()) : Date.now();
}

function normalizedModel(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[_\s]+/g, "-");
}

function normalizedThinkingLevel(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function selectModelErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const selectedModel = args?.model !== undefined ? String(args.model || "").trim() || null : null;
  const selectedThinkingLevel = args?.thinking_level !== undefined ? String(args.thinking_level || "").trim() || null : null;
  const errorCode: ConsumerErrorCode = geminiBatchRpcErrorCode(error);
  return safeOutput({
    ok: false,
    selected_model: selectedModel,
    selected_thinking_level: selectedThinkingLevel,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

export function resolveGeminiSelectModelRpcVariant(args: any = {}): GeminiSelectModelResolution {
  const hasModel = args?.model !== undefined && String(args.model || "").trim() !== "";
  const hasThinking = args?.thinking_level !== undefined && String(args.thinking_level || "").trim() !== "";
  if (!hasModel && !hasThinking) {
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_select_model requires at least one of: model, thinking_level");
  }
  if (hasModel && hasThinking) {
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webai_gemini_select_model combined model + thinking_level is RPC_NOT_AVAILABLE from Wave A captures");
  }

  if (hasModel) {
    const model = normalizedModel(args.model);
    if (model === "3.5-flash" || model === "flash" || model === "gemini-3.5-flash") {
      return { variant: "select_flash", selectedModel: "3.5-flash", selectedThinkingLevel: null };
    }
    if (model === "3.1-flash-lite" || model === "flash-lite" || model === "gemini-3.1-flash-lite") {
      return { variant: "select_flash_lite", selectedModel: "3.1-flash-lite", selectedThinkingLevel: null };
    }
    if (model === "3.1-pro" || model === "pro" || model === "gemini-3.1-pro") {
      // Wave C1 capture (2026-05-27): same L5adhe settings POST as flash/flash_lite,
      // mode_id "e6fa609c3fa255c0" verified live on gemini-9225 (driver toggled
      // Open mode picker, currently Flash-Lite -> Pro). Template at
      // .runs/path-c-gemini-rpc/wave-c1-coverage-gaps/webai_gemini_select_model--select_pro.
      return { variant: "select_pro", selectedModel: "3.1-pro", selectedThinkingLevel: null };
    }
    throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_select_model unsupported model: ${String(args.model)}`);
  }

  const thinkingLevel = normalizedThinkingLevel(args.thinking_level);
  if (thinkingLevel === "standard") return { variant: "thinking_standard", selectedModel: null, selectedThinkingLevel: "standard" };
  if (thinkingLevel === "extended") return { variant: "thinking_extended", selectedModel: null, selectedThinkingLevel: "extended" };
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_select_model unsupported thinking_level: ${String(args.thinking_level)}`);
}

export async function webAiGeminiSelectModelRpcWithFetch(args: any, fetchRpc: GeminiBatchRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  let resolution: GeminiSelectModelResolution | null = null;
  let httpStatus: number | null = null;
  try {
    resolution = resolveGeminiSelectModelRpcVariant(effective);
    const snapshot = effective.__cdpSnapshot as GeminiBatchRpcSnapshot;
    if (!snapshot) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webAiGeminiSelectModelRpcWithFetch requires args.__cdpSnapshot");
    const template = loadGeminiBatchRpcPayloadTemplate(effective, `webai_gemini_select_model--${resolution.variant}`);
    const request = buildGeminiBatchRpcRequest(effective, snapshot, template, { tool: "webai_gemini_select_model", variant: resolution.variant, purpose: resolution.variant });
    const { response, decoded } = await runGeminiBatchRpcRequest(fetchRpc, request);
    httpStatus = response.status;
    return safeOutput({
      ok: true,
      selected_model: resolution.selectedModel,
      selected_thinking_level: resolution.selectedThinkingLevel,
      errorCode: null,
      http_status: response.status,
      elapsed_ms: nowMs(effective) - started,
      rpc_id: request.rpcId,
      rpc_ack: decoded.rpcIds.includes(request.rpcId)
    });
  } catch (error: any) {
    return selectModelErrorOutput(effective, error, {
      selected_model: resolution?.selectedModel ?? (effective.model ? String(effective.model).trim() : null),
      selected_thinking_level: resolution?.selectedThinkingLevel ?? (effective.thinking_level ? String(effective.thinking_level).trim() : null),
      http_status: httpStatus,
      elapsed_ms: nowMs(effective) - started
    });
  }
}

export async function webAiGeminiSelectModelRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const lease = acquireProfileLease(effective.profile);
  try {
    const snapshot = await captureGeminiBatchRpcSnapshot(effective, runtime, targetUrlForGeminiBatchRpc(effective, GEMINI_CHAT_URL));
    return await webAiGeminiSelectModelRpcWithFetch({ ...effective, __cdpSnapshot: snapshot }, effective.__fetch || defaultGeminiBatchRpcFetch);
  } catch (error: any) {
    return selectModelErrorOutput(effective, error);
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}
