const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  GeminiCanvasRpcFetch,
  GeminiCanvasRpcRequest
} from "../src/mcp/gemini_canvas_rpc";
import { webAiGeminiDeepResearchRpcWithPage } from "../src/mcp/gemini_deep_research_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b4-canvas-research/fixtures");
const cdpSnapshot = {
  at: "AT-deep-fixture",
  bl: "boq_assistant-bard-web-server_deep_fixture_p0",
  fsid: "3333333333333333333",
  userAgent: "Mozilla/5.0 Deep Research Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
};

function fixture(operation: string): { template: any; responseText: string } {
  const dir = path.join(FIXTURE_ROOT, operation);
  const template = JSON.parse(fs.readFileSync(path.join(dir, "payload-template.json"), "utf8"));
  const responseText = fs.readFileSync(path.join(dir, "response-stream.txt"), "utf8");
  return { template, responseText };
}

function fReqFromBody(body: string): any {
  const value = new URLSearchParams(body).get("f.req");
  assert.equal(typeof value, "string");
  return JSON.parse(value as string);
}

function makePage(initialUrl = "about:blank") {
  const calls: Array<{ method: string; selector?: string; url?: string; state?: string }> = [];
  let currentUrl = initialUrl;
  return {
    calls,
    url: () => currentUrl,
    goto: async (url: string) => { calls.push({ method: "goto", url }); currentUrl = url; },
    waitForLoadState: async (state: string) => { calls.push({ method: "waitForLoadState", state }); },
    bringToFront: async () => { calls.push({ method: "bringToFront" }); },
    waitForSelector: async (selector: string) => { calls.push({ method: "waitForSelector", selector }); return {}; },
    click: async (selector: string) => { calls.push({ method: "click", selector }); }
  };
}

function fetchForDeepResearch(calls: GeminiCanvasRpcRequest[] = []): GeminiCanvasRpcFetch {
  const fx = fixture("webai_gemini_deep_research--start");
  return async (_page, request) => {
    calls.push(request);
    assert.equal(request.tool, "webai_gemini_deep_research");
    assert.equal(request.variant, "start");
    assert.equal(request.method, "POST");
    assert.equal(request.profile, "gemini-9225");
    assert.equal(request.headers["x-same-domain"], "1");
    assert.equal(request.headers["user-agent"], cdpSnapshot.userAgent);
    assert.equal(new URLSearchParams(request.body).get("at"), cdpSnapshot.at);
    assert.equal(new URL(request.url).searchParams.get("bl"), cdpSnapshot.bl);
    assert.equal(new URL(request.url).searchParams.get("f.sid"), cdpSnapshot.fsid);
    assert.equal(new URL(request.url).searchParams.get("rt"), "c");

    const fReq = fReqFromBody(request.body);
    assert.equal(fReq[0], null);
    assert.equal(typeof fReq[1], "string");
    const inner = JSON.parse(fReq[1]);
    assert.equal(inner[0][0], "Wave B4 deep research RPC_DEEP_RESEARCH");
    assert.notDeepEqual(fReq, fx.template.f_req_template, "dynamic ids should be regenerated while preserving captured body shape");
    return { status: 200, text: fx.responseText, headers: {}, elapsedMs: 91 };
  };
}

test("Gemini Deep Research RPC runs DOM-nav prelude then sends captured StreamGenerate body", async () => {
  const page = makePage();
  const calls: GeminiCanvasRpcRequest[] = [];
  const result = await webAiGeminiDeepResearchRpcWithPage({
    profile: "gemini-9225",
    prompt: "Wave B4 deep research RPC_DEEP_RESEARCH",
    confirmed: true,
    __cdpSnapshot: cdpSnapshot,
    __now: () => 1000
  }, page, fetchForDeepResearch(calls), { taskId: "gemini_research_fixture" });

  assert.equal(result.errorCode, null);
  assert.equal(result.backend, "rpc");
  assert.equal(result.ok, true);
  assert.equal(result.status, "queued");
  assert.equal(result.task_id, "gemini_research_fixture");
  assert.match(String(result.chat_url), /gemini\.google\.com\/app\/c_/);
  assert.match(String(result.response_text), /RPC_DEEP_RESEARCH|Research Websites|research/i);
  assert.equal(result.wait_ms, 91);
  assert.equal(calls.length, 1);
  assert.ok(page.calls.some((call) => call.method === "goto" && /gemini\.google\.com\/app/.test(String(call.url))));
  assert.ok(page.calls.some((call) => call.method === "click" && call.selector === 'button[aria-label="Upload & tools"]'));
  assert.ok(page.calls.some((call) => call.method === "click" && String(call.selector).includes("Deep research")));
});

test("Gemini Deep Research RPC requires explicit confirmation before HTTP", async () => {
  const page = makePage("https://gemini.google.com/app/c_deepfixture");
  let fetchCalls = 0;
  const result = await webAiGeminiDeepResearchRpcWithPage({
    profile: "gemini-9225",
    prompt: "Wave B4 deep research RPC_DEEP_RESEARCH",
    __cdpSnapshot: cdpSnapshot,
    __now: () => 1000
  }, page, async () => {
    fetchCalls += 1;
    throw new Error("fetch should not run");
  }, { taskId: "gemini_research_guard" });

  assert.equal(fetchCalls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD);
  assert.match(String(result.message), /confirmed: true/i);
});
