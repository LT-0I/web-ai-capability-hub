const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import { GeminiBatchRpcFetch, GeminiBatchRpcRequest } from "../src/mcp/gemini_workspace_rpc";
import {
  resolveGeminiSelectModelRpcVariant,
  webAiGeminiSelectModelRpcWithFetch
} from "../src/mcp/gemini_select_model_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures");
const cdpSnapshot = {
  at: "AT-select-fixture",
  bl: "boq_assistant-bard-web-server_select_fixture_p0",
  fsid: "2222222222222222222",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Select Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
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

function selectedModeIdFromBody(body: string): string | null {
  const top = fReqFromBody(body);
  const nested = JSON.parse(top[0][0][1]);
  return nested[0][99] || null;
}

function fetchFor(operation: string, expectedModeId: string | null, calls: GeminiBatchRpcRequest[] = []): GeminiBatchRpcFetch {
  const fx = fixture(operation);
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
  { name: "select_flash", args: { model: "3.5-flash" }, selectedModel: "3.5-flash", selectedThinkingLevel: null, modeId: "8c46e95b1a07cecc" },
  { name: "select_flash_lite", args: { model: "3.1-flash-lite" }, selectedModel: "3.1-flash-lite", selectedThinkingLevel: null, modeId: "56fdd199312815e2" },
  { name: "thinking_standard", args: { thinking_level: "standard" }, selectedModel: null, selectedThinkingLevel: "standard", modeId: "56fdd199312815e2" },
  { name: "thinking_extended", args: { thinking_level: "extended" }, selectedModel: null, selectedThinkingLevel: "extended", modeId: "56fdd199312815e2" }
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
    }, fetchFor(`webai_gemini_select_model--${variantCase.name}`, variantCase.modeId, calls));

    assert.equal(result.errorCode, null);
    assert.equal(result.ok, true);
    assert.equal(result.selected_model, variantCase.selectedModel);
    assert.equal(result.selected_thinking_level, variantCase.selectedThinkingLevel);
    assert.equal(result.rpc_ack, true);
    assert.equal(result.rpc_id, "L5adhe");
    assert.equal(calls.length, 1);
  });
}

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
