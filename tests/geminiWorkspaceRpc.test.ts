const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  decodeGeminiBatchRpcResponse,
  GeminiBatchRpcFetch,
  GeminiBatchRpcRequest,
  webAiGeminiWorkspaceRpcWithFetch
} from "../src/mcp/gemini_workspace_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures");
const cdpSnapshot = {
  at: "AT-workspace-fixture",
  bl: "boq_assistant-bard-web-server_workspace_fixture_p0",
  fsid: "1111111111111111111",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Workspace Fixture",
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

function fetchFor(operation: string, calls: GeminiBatchRpcRequest[] = []): GeminiBatchRpcFetch {
  const fx = fixture(operation);
  return async (request) => {
    calls.push(request);
    assert.equal(request.method, "POST");
    assert.equal(request.profile, "gemini-9225");
    assert.equal(request.headers.cookie, cdpSnapshot.cookieHeader);
    assert.equal(request.headers["user-agent"], cdpSnapshot.userAgent);
    assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
    assert.deepEqual(fReqFromBody(request.body), fx.template.f_req_template);
    assert.equal(new URL(request.url).searchParams.get("bl"), cdpSnapshot.bl);
    assert.equal(new URL(request.url).searchParams.get("f.sid"), cdpSnapshot.fsid);
    const decoded = decodeGeminiBatchRpcResponse(fx.responseText);
    assert.ok(decoded.rpcIds.includes(request.rpcId));
    return { status: 200, text: fx.responseText, headers: {} as Record<string, string> };
  };
}

const WORKSPACE_CASES = [
  ["gems", "surface_gems"],
  ["scheduled", "surface_scheduled"],
  ["study", "surface_study"],
  ["workspace_integration", "surface_workspace_integration"],
  ["connected_apps", "surface_connected_apps"],
  ["personalization", "surface_personalization"]
] as const;

for (const [surface, variant] of WORKSPACE_CASES) {
  test(`Gemini workspace RPC ${surface} sends captured ${variant} batchexecute body`, async () => {
    const calls: GeminiBatchRpcRequest[] = [];
    const result = await webAiGeminiWorkspaceRpcWithFetch({
      profile: "gemini-9225",
      surface,
      __cdpSnapshot: cdpSnapshot,
      __now: () => 1000
    }, fetchFor(`webai_gemini_workspace--${variant}`, calls));

    assert.equal(result.errorCode, null);
    assert.equal(result.surface, surface);
    assert.equal(result.rpc_ack, true);
    assert.equal(result.rpc_id, "MaZiqc");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, "webai_gemini_workspace");
    assert.equal(calls[0].variant, variant);
  });
}

test("Gemini workspace RPC marks unverified audio_overview as RPC_NOT_AVAILABLE without HTTP", async () => {
  let calls = 0;
  const result = await webAiGeminiWorkspaceRpcWithFetch({
    profile: "gemini-9225",
    surface: "audio_overview",
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
