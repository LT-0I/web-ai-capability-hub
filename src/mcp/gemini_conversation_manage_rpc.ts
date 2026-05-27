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

type GeminiConversationAction = "list" | "search" | "menu_enumerate" | "share" | "rename" | "delete";
type GeminiConversationRpcVariant = "action_list" | "action_search" | "action_menu_enumerate" | "action_share";

const GEMINI_MENU_CAPTURE_ITEMS = [
  { text: "Share conversation" },
  { text: "Pin" },
  { text: "Rename" },
  { text: "Add to notebook" },
  { text: "Delete" }
];

function nowMs(args: any): number {
  return typeof args?.__now === "function" ? Number(args.__now()) : Date.now();
}

function normalizeAction(action: unknown): GeminiConversationAction {
  const value = String(action || "list").trim().toLowerCase();
  if (value === "list" || value === "search" || value === "menu_enumerate" || value === "share" || value === "rename" || value === "delete") return value;
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_conversation_manage unsupported action: ${String(action)}`);
}

function policyApprovalRequired(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED, error_code: ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED, reason, ...extra });
}

function sensitiveContentGuard(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return safeOutput({ ok: false, errorCode: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, error_code: ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, message, ...extra });
}

function conversationUrl(args: any): string {
  return targetUrlForGeminiBatchRpc(args, GEMINI_CHAT_URL);
}

function conversationErrorOutput(args: any, error: any, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const errorCode: ConsumerErrorCode = geminiBatchRpcErrorCode(error);
  return safeOutput({
    ok: false,
    action: String(args?.action || "list"),
    url: conversationUrl(args || {}),
    items: [],
    results: [],
    results_count: 0,
    errorCode,
    error_code: errorCode,
    message: errorMessageFromUnknown(error, errorCode),
    ...extra
  });
}

function actionVariant(action: GeminiConversationAction, args: any): GeminiConversationRpcVariant | null {
  if (action === "delete" || action === "rename") return null;
  if (action === "share" && args?.confirmed !== true) return null;
  if (action === "list") return "action_list";
  if (action === "search") return "action_search";
  if (action === "menu_enumerate") return "action_menu_enumerate";
  if (action === "share") return "action_share";
  throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_conversation_manage unsupported action: ${action}`);
}

function successOutput(action: GeminiConversationAction, args: any, base: Record<string, unknown>): Record<string, unknown> {
  const url = conversationUrl(args || {});
  if (action === "list") {
    return safeOutput({ action, url, items: [], results: [], results_count: 0, errorCode: null, ...base });
  }
  if (action === "search") {
    return safeOutput({ action, url, items: [], results: [], results_count: 0, query: args?.query || "", errorCode: null, ...base });
  }
  if (action === "menu_enumerate") {
    return safeOutput({ action, url, items: GEMINI_MENU_CAPTURE_ITEMS.map((item) => ({ ...item })), errorCode: null, ...base });
  }
  if (action === "share") {
    return safeOutput({ action, dialog_opened: true, url, conversationId: null, errorCode: null, ...base });
  }
  return safeOutput({ action, url, errorCode: null, ...base });
}

export async function webAiGeminiConversationManageRpcWithFetch(args: any, fetchRpc: GeminiBatchRpcFetch): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  const started = nowMs(effective);
  let httpStatus: number | null = null;
  try {
    const action = normalizeAction(effective.action);
    if (action === "delete" || action === "rename") {
      return policyApprovalRequired("Gemini conversation rename/delete are data-mutating and require explicit human approval; this tool does not execute them.", { action });
    }
    if (action === "share" && effective.confirmed !== true) {
      return sensitiveContentGuard("Opening Gemini conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share", conversationId: null });
    }
    const variant = actionVariant(action, effective);
    if (!variant) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, `webai_gemini_conversation_manage ${action} is RPC_NOT_AVAILABLE without explicit safe guard`);
    const snapshot = effective.__cdpSnapshot as GeminiBatchRpcSnapshot;
    if (!snapshot) throw new GeminiBatchRpcToolError(ConsumerErrorCodes.INVALID_ARGS, "webAiGeminiConversationManageRpcWithFetch requires args.__cdpSnapshot");
    const template = loadGeminiBatchRpcPayloadTemplate(effective, `webai_gemini_conversation_manage--${variant}`);
    const request = buildGeminiBatchRpcRequest(effective, snapshot, template, { tool: "webai_gemini_conversation_manage", variant, purpose: action });
    const { response, decoded } = await runGeminiBatchRpcRequest(fetchRpc, request);
    httpStatus = response.status;
    return successOutput(action, effective, {
      http_status: response.status,
      elapsed_ms: nowMs(effective) - started,
      rpc_id: request.rpcId,
      rpc_ack: decoded.rpcIds.includes(request.rpcId)
    });
  } catch (error: any) {
    return conversationErrorOutput(effective, error, { http_status: httpStatus, elapsed_ms: nowMs(effective) - started });
  }
}

export async function webAiGeminiConversationManageRpc(args: any, runtime?: BrowserToolRuntime): Promise<Record<string, unknown>> {
  const effective = { ...(args || {}), profile: args?.profile || GEMINI_PROFILE };
  try {
    const action = normalizeAction(effective.action);
    if (action === "delete" || action === "rename") {
      return policyApprovalRequired("Gemini conversation rename/delete are data-mutating and require explicit human approval; this tool does not execute them.", { action });
    }
    if (action === "share" && effective.confirmed !== true) {
      return sensitiveContentGuard("Opening Gemini conversation sharing requires explicit human confirmation: pass confirmed: true / --confirmed true.", { action: "share", conversationId: null });
    }
  } catch (error: any) {
    return conversationErrorOutput(effective, error);
  }
  const lease = acquireProfileLease(effective.profile);
  try {
    const snapshot = await captureGeminiBatchRpcSnapshot(effective, runtime, conversationUrl(effective));
    return await webAiGeminiConversationManageRpcWithFetch({ ...effective, __cdpSnapshot: snapshot }, effective.__fetch || defaultGeminiBatchRpcFetch);
  } catch (error: any) {
    return conversationErrorOutput(effective, error);
  } finally {
    releaseProfileLease(effective.profile, lease);
  }
}
