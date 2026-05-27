const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  decodeGeminiCanvasRpcStream,
  GeminiCanvasRpcFetch,
  GeminiCanvasRpcRequest,
  webAiGeminiCanvasRpcWithPage
} from "../src/mcp/gemini_canvas_rpc";

const FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b4-canvas-research/fixtures");
const cdpSnapshot = {
  at: "AT-canvas-fixture",
  bl: "boq_assistant-bard-web-server_canvas_fixture_p0",
  fsid: "2222222222222222222",
  userAgent: "Mozilla/5.0 Canvas Fixture",
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

function fetchForCanvasOpen(calls: GeminiCanvasRpcRequest[] = []): GeminiCanvasRpcFetch {
  const fx = fixture("webai_gemini_canvas_edit--open_canvas");
  return async (_page, request) => {
    calls.push(request);
    assert.equal(request.tool, "webai_gemini_canvas_edit");
    assert.equal(request.variant, "open_canvas");
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
    assert.equal(inner[0][0], "Create a short Canvas note titled Wave B4 RPC_OPEN_CANVAS.");
    assert.notDeepEqual(fReq, fx.template.f_req_template, "dynamic ids should be regenerated while preserving captured body shape");
    return { status: 200, text: fx.responseText, headers: {}, elapsedMs: 57 };
  };
}

test("Gemini Canvas RPC open_canvas runs DOM-nav prelude then sends captured StreamGenerate body", async () => {
  const page = makePage();
  const calls: GeminiCanvasRpcRequest[] = [];
  const result = await webAiGeminiCanvasRpcWithPage({
    profile: "gemini-9225",
    prompt: "Create a short Canvas note titled Wave B4 RPC_OPEN_CANVAS.",
    confirmed: true,
    __cdpSnapshot: cdpSnapshot,
    __now: () => 1000
  }, page, fetchForCanvasOpen(calls));

  assert.equal(result.errorCode, null);
  assert.equal(result.backend, "rpc");
  assert.equal(result.rpc_variant, "open_canvas");
  assert.equal(result.canvas_opened, true);
  assert.match(String(result.canvas_html_after), /RPC_OPEN_CANVAS|Wave A Canvas/);
  assert.equal(result.wait_ms, 57);
  assert.equal(calls.length, 1);
  assert.ok(page.calls.some((call) => call.method === "goto" && /gemini\.google\.com\/app/.test(String(call.url))));
  assert.ok(page.calls.some((call) => call.method === "click" && call.selector === 'button[aria-label="Upload & tools"]'));
  assert.ok(page.calls.some((call) => call.method === "click" && String(call.selector).includes("Canvas")));
  assert.ok(page.calls.some((call) => call.method === "waitForSelector" && call.selector === 'button[aria-label="Deselect Canvas"]'));
});

test("Gemini Canvas RPC documents non-verified sub-surface edits as RPC_NOT_AVAILABLE without HTTP", async () => {
  const page = makePage("https://gemini.google.com/app/c_canvasfixture");
  let fetchCalls = 0;
  const result = await webAiGeminiCanvasRpcWithPage({
    profile: "gemini-9225",
    edit_text: "replace canvas text",
    __cdpSnapshot: cdpSnapshot,
    __now: () => 1000
  }, page, async () => {
    fetchCalls += 1;
    throw new Error("fetch should not run");
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
  assert.match(String(result.message), /RPC_NOT_AVAILABLE/i);
});

test("Gemini Canvas RPC decoder extracts canvas content and artifact URL from Wave A stream", () => {
  const fx = fixture("webai_gemini_canvas_edit--open_canvas");
  const decoded = decodeGeminiCanvasRpcStream(fx.responseText);
  assert.match(decoded.canvasHtml, /RPC_OPEN_CANVAS|Wave A Canvas/);
  assert.match(String(decoded.conversationId), /^c_/);
  assert.match(String(decoded.responseId), /^r_/);
  assert.match(String(decoded.artifactUrl), /googleusercontent\.com\/immersive_entry_chip/);
});
