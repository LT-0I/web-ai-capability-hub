const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  decodeGeminiBatchRpcResponse,
  GeminiBatchRpcFetch,
  GeminiBatchRpcRequest
} from "../src/mcp/gemini_workspace_rpc";
import { webAiGeminiConversationManageRpcWithFetch } from "../src/mcp/gemini_conversation_manage_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures");
const cdpSnapshot = {
  at: "AT-conversation-fixture",
  bl: "boq_assistant-bard-web-server_conversation_fixture_p0",
  fsid: "3333333333333333333",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Conversation Fixture",
  pageUrl: "https://gemini.google.com/app/c_fixture"
};

function fixture(operation: string): { template: any; responseText: string } {
  const dir = path.join(FIXTURE_ROOT, operation);
  const template = JSON.parse(fs.readFileSync(path.join(dir, "payload-template.json"), "utf8"));
  const responseJson = JSON.parse(fs.readFileSync(path.join(dir, "response-stream.json"), "utf8"));
  return { template, responseText: String(responseJson.text) };
}

function fReqFromBody(body: string): any {
  const value = new URLSearchParams(body).get("f.req");
  assert.equal(typeof value, "string");
  return JSON.parse(value as string);
}

function fetchFor(operation: string, calls: GeminiBatchRpcRequest[] = []): GeminiBatchRpcFetch {
  const fx = fixture(operation);
  return async (request) => {
    calls.push(request);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.cookie, cdpSnapshot.cookieHeader);
    assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
    assert.deepEqual(fReqFromBody(request.body), fx.template.f_req_template);
    return { status: 200, text: fx.responseText, headers: {} as Record<string, string> };
  };
}

const RPC_CASES = [
  { action: "list", variant: "action_list" },
  { action: "search", variant: "action_search", query: "fixture" },
  { action: "menu_enumerate", variant: "action_menu_enumerate" },
  { action: "share", variant: "action_share", confirmed: true }
] as const;

for (const variantCase of RPC_CASES) {
  test(`Gemini conversation_manage RPC ${variantCase.action} sends captured ${variantCase.variant} body`, async () => {
    const calls: GeminiBatchRpcRequest[] = [];
    const result = await webAiGeminiConversationManageRpcWithFetch({
      profile: "gemini-9225",
      action: variantCase.action,
      query: (variantCase as any).query,
      confirmed: (variantCase as any).confirmed,
      tab_url_contains: "c_fixture",
      __cdpSnapshot: cdpSnapshot,
      __now: () => 1000
    }, fetchFor(`webai_gemini_conversation_manage--${variantCase.variant}`, calls));

    assert.equal(result.errorCode, null);
    assert.equal(result.action, variantCase.action);
    assert.equal(result.rpc_ack, true);
    assert.equal(result.rpc_id, "MaZiqc");
    assert.equal(calls.length, 1);
    if (variantCase.action === "menu_enumerate") {
      assert.ok(Array.isArray(result.items));
      assert.ok((result.items as any[]).some((item) => String(item.text || "").includes("Rename")));
    }
    if (variantCase.action === "share") assert.equal(result.dialog_opened, true);
  });
}

test("Gemini conversation_manage RPC decodeGeminiBatchRpcResponse extracts MaZiqc rpc ack across captured action fixtures", () => {
  for (const variantCase of RPC_CASES) {
    const fx = fixture(`webai_gemini_conversation_manage--${variantCase.variant}`);
    const decoded = decodeGeminiBatchRpcResponse(fx.responseText);
    assert.equal(decoded.ok, true, `decoded.ok for ${variantCase.variant}`);
    assert.deepEqual(decoded.rpcIds, ["MaZiqc"], `rpcIds for ${variantCase.variant}`);
    assert.ok(decoded.eventTypes.includes("wrb.fr"), `wrb.fr event for ${variantCase.variant}`);
  }
});

test("Gemini conversation_manage RPC decodeGeminiBatchRpcResponse rejects empty stream as INVALID_JSON", () => {
  assert.throws(() => decodeGeminiBatchRpcResponse(""), /INVALID_JSON|did not contain length-prefixed/);
  assert.throws(() => decodeGeminiBatchRpcResponse("noise without brackets"), /INVALID_JSON|did not contain length-prefixed/);
});

test("Gemini conversation_manage RPC keeps share unconfirmed on SENSITIVE_CONTENT_GUARD safe path", async () => {
  let calls = 0;
  const result = await webAiGeminiConversationManageRpcWithFetch({
    profile: "gemini-9225",
    action: "share",
    tab_url_contains: "c_fixture",
    __cdpSnapshot: cdpSnapshot
  }, async () => {
    calls += 1;
    throw new Error("fetch should not run");
  });
  assert.equal(calls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD);
});

for (const action of ["rename", "delete"] as const) {
  test(`Gemini conversation_manage RPC keeps ${action} on POLICY_APPROVAL_REQUIRED safe path`, async () => {
    let calls = 0;
    const result = await webAiGeminiConversationManageRpcWithFetch({
      profile: "gemini-9225",
      action,
      tab_url_contains: "c_fixture",
      __cdpSnapshot: cdpSnapshot
    }, async () => {
      calls += 1;
      throw new Error("fetch should not run");
    });
    assert.equal(calls, 0);
    assert.equal(result.errorCode, ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED);
  });
}
