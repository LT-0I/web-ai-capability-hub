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
import {
  resolveGeminiSelectModelRpcVariant,
  webAiGeminiSelectModelRpcWithFetch
} from "../src/mcp/gemini_select_model_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures");
const WAVE_C1_FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-c1-coverage-gaps");
const cdpSnapshot = {
  at: "AT-select-fixture",
  bl: "boq_assistant-bard-web-server_select_fixture_p0",
  fsid: "2222222222222222222",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Select Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
};

function fixture(operation: string, root: string = FIXTURE_ROOT): { template: any; responseText: string } {
  const dir = path.join(root, operation);
  const template = JSON.parse(fs.readFileSync(path.join(dir, "payload-template.json"), "utf8"));
  const responseJson = JSON.parse(fs.readFileSync(path.join(dir, "response-stream.json"), "utf8"));
  return { template, responseText: String(responseJson.text) };
}

function fReqFromBody(body: string): any {
  const value = new URLSearchParams(body).get("f.req");
  assert.equal(typeof value, "string");
  return JSON.parse(value as string);
}

function selectedModeIdFromBody(body: string): string | null {
  const top = fReqFromBody(body);
  const nested = JSON.parse(top[0][0][1]);
  return nested[0][99] || null;
}

function fetchFor(operation: string, expectedModeId: string | null, calls: GeminiBatchRpcRequest[] = [], root: string = FIXTURE_ROOT): GeminiBatchRpcFetch {
  const fx = fixture(operation, root);
  return async (request) => {
    calls.push(request);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.cookie, cdpSnapshot.cookieHeader);
    assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
    assert.deepEqual(fReqFromBody(request.body), fx.template.f_req_template);
    assert.equal(selectedModeIdFromBody(request.body), expectedModeId);
    return { status: 200, text: fx.responseText, headers: {} as Record<string, string> };
  };
}

const SELECT_CASES = [
  { name: "select_flash", args: { model: "3.5-flash" }, selectedModel: "3.5-flash", selectedThinkingLevel: null, modeId: "8c46e95b1a07cecc", root: FIXTURE_ROOT },
  { name: "select_flash_lite", args: { model: "3.1-flash-lite" }, selectedModel: "3.1-flash-lite", selectedThinkingLevel: null, modeId: "56fdd199312815e2", root: FIXTURE_ROOT },
  { name: "select_pro", args: { model: "3.1-pro" }, selectedModel: "3.1-pro", selectedThinkingLevel: null, modeId: "e6fa609c3fa255c0", root: WAVE_C1_FIXTURE_ROOT },
  { name: "thinking_standard", args: { thinking_level: "standard" }, selectedModel: null, selectedThinkingLevel: "standard", modeId: "56fdd199312815e2", root: FIXTURE_ROOT },
  { name: "thinking_extended", args: { thinking_level: "extended" }, selectedModel: null, selectedThinkingLevel: "extended", modeId: "56fdd199312815e2", root: FIXTURE_ROOT }
];

for (const variantCase of SELECT_CASES) {
  test(`Gemini select_model RPC ${variantCase.name} sends captured L5adhe settings body`, async () => {
    const calls: GeminiBatchRpcRequest[] = [];
    const resolved = resolveGeminiSelectModelRpcVariant(variantCase.args);
    assert.equal(resolved.variant, variantCase.name);
    const result = await webAiGeminiSelectModelRpcWithFetch({
      profile: "gemini-9225",
      ...variantCase.args,
      __cdpSnapshot: cdpSnapshot,
      __now: () => 1000
    }, fetchFor(`webai_gemini_select_model--${variantCase.name}`, variantCase.modeId, calls, variantCase.root));

    assert.equal(result.errorCode, null);
    assert.equal(result.ok, true);
    assert.equal(result.selected_model, variantCase.selectedModel);
    assert.equal(result.selected_thinking_level, variantCase.selectedThinkingLevel);
    assert.equal(result.rpc_ack, true);
    assert.equal(result.rpc_id, "L5adhe");
    assert.equal(calls.length, 1);
  });
}

test("Gemini select_model RPC decodeGeminiBatchRpcResponse extracts L5adhe rpc ack across all captured select fixtures", () => {
  for (const variantCase of SELECT_CASES) {
    const fx = fixture(`webai_gemini_select_model--${variantCase.name}`, variantCase.root);
    const decoded = decodeGeminiBatchRpcResponse(fx.responseText);
    assert.equal(decoded.ok, true, `decoded.ok for ${variantCase.name}`);
    assert.deepEqual(decoded.rpcIds, ["L5adhe"], `rpcIds for ${variantCase.name}`);
    assert.ok(decoded.eventTypes.includes("wrb.fr"), `wrb.fr event for ${variantCase.name}`);
  }
});

test("Gemini select_model RPC resolves 3.1-pro / pro / gemini-3.1-pro aliases to select_pro (Wave C1 RPC_AVAILABLE)", () => {
  for (const alias of ["3.1-pro", "pro", "gemini-3.1-pro", "3.1-PRO"]) {
    const resolved = resolveGeminiSelectModelRpcVariant({ model: alias });
    assert.equal(resolved.variant, "select_pro", `variant for ${alias}`);
    assert.equal(resolved.selectedModel, "3.1-pro", `selectedModel for ${alias}`);
    assert.equal(resolved.selectedThinkingLevel, null, `thinkingLevel for ${alias}`);
  }
});

test("Gemini select_model RPC select_pro captured mode id e6fa609c3fa255c0 matches resolved variant payload", () => {
  const fx = fixture("webai_gemini_select_model--select_pro", WAVE_C1_FIXTURE_ROOT);
  const top = fx.template.f_req_template;
  const nested = JSON.parse(top[0][0][1]);
  assert.equal(nested[0][99], "e6fa609c3fa255c0");
  const decoded = decodeGeminiBatchRpcResponse(fx.responseText);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.rpcIds, ["L5adhe"]);
  assert.ok(decoded.eventTypes.includes("wrb.fr"));
});

test("Gemini select_model RPC select_flash captured mode id matches resolved variant payload", () => {
  const fx = fixture("webai_gemini_select_model--select_flash");
  const top = fx.template.f_req_template;
  const nested = JSON.parse(top[0][0][1]);
  assert.equal(nested[0][99], "8c46e95b1a07cecc");
  const decoded = decodeGeminiBatchRpcResponse(fx.responseText);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.rpcIds, ["L5adhe"]);
});

test("Gemini select_model RPC marks unverified combined model+thinking as RPC_NOT_AVAILABLE without HTTP", async () => {
  let calls = 0;
  const result = await webAiGeminiSelectModelRpcWithFetch({
    profile: "gemini-9225",
    model: "3.1-flash-lite",
    thinking_level: "standard",
    __cdpSnapshot: cdpSnapshot,
    __now: () => 1000
  }, async () => {
    calls += 1;
    throw new Error("fetch should not run");
  });
  assert.equal(calls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(result.message), /RPC_NOT_AVAILABLE/i);
});
