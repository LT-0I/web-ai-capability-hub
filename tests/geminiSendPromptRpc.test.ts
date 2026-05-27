const test = require("node:test");
const assert = require("node:assert/strict");
import { buildGeminiRpcFReq, decodeGeminiStreamText, webAiGeminiSendPromptRpc, GeminiRpcPayloadTemplate } from "../src/mcp/gemini_send_prompt_rpc";

const capturedNested: any[] = [];
capturedNested[1] = ["c_1622165270f29326", "r_18b388bf09c40c2f"];
capturedNested[4] = [["rc_69da5a1bf0655c99", ["4"], null, null, null, null, true, null, [1], "und"]];
capturedNested[5] = ["California, USA", "SWML_DESCRIPTION_FROM_YOUR_INTERNET_ADDRESS"];
capturedNested[8] = "US";
capturedNested[19] = "en";
capturedNested[26] = [[[[null, [null, 0, "4"]]]]];
capturedNested[44] = [[[[1004, "Longer"], [1005, "Shorter"], [1001, "Try again"]]]];
const capturedPayload = JSON.stringify([["wrb.fr", null, JSON.stringify(capturedNested)]]);
const CAPTURED_BASIC_STREAM = `)]}'\n\n${capturedPayload.length}\n${capturedPayload}\n`;

function fixtureTemplate(): GeminiRpcPayloadTemplate {
  const inner = Array.from({ length: 81 }, () => null) as unknown[];
  inner[0] = ["{{prompt}}", 0, null, null, null, null, 0];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];
  inner[3] = "!opaque-fixture-token";
  inner[4] = "0123456789abcdef0123456789abcdef";
  inner[6] = [1];
  inner[7] = 1;
  inner[10] = 1;
  inner[17] = [[0]];
  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [1];
  inner[59] = "11111111-2222-3333-4444-555555555555";
  inner[68] = 2;
  inner[79] = 1;
  inner[80] = 1;
  return { f_req_template: [null, inner] };
}

const cdpSnapshot = {
  at: "AT-fixture",
  bl: "boq_assistant-bard-web-server_fixture_p0",
  fsid: "123456789",
  cookieHeader: "SID=fixture; __Secure-1PSID=fixture",
  userAgent: "Mozilla/5.0 Fixture",
  pageUrl: "https://gemini.google.com/app?hl=en"
};

test("Gemini RPC decoder extracts assistant text from captured StreamGenerate replay", () => {
  assert.equal(decodeGeminiStreamText(CAPTURED_BASIC_STREAM), "4");
});

test("Gemini RPC request builder rewrites only the prompt slot", () => {
  const fReq = JSON.parse(buildGeminiRpcFReq("what is 2+2?", fixtureTemplate()));
  const inner = JSON.parse(fReq[1]);
  assert.equal(inner[0][0], "what is 2+2?");
  assert.equal(inner[3], "!opaque-fixture-token");
  assert.equal(inner[1][0], "en");
});

test("Gemini RPC send_prompt returns DOM-shaped success output with mocked HTTP/CDP", async () => {
  const calls: any[] = [];
  const result = await webAiGeminiSendPromptRpc({
    profile: "gemini-9225",
    prompt: "what is 2+2?",
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate(),
    __fetch: async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => CAPTURED_BASIC_STREAM };
    }
  });

  assert.equal(result.errorCode, null);
  assert.equal(result.completion_detected, true);
  assert.equal(result.response_text, "4");
  assert.equal(result.chat_url, "https://gemini.google.com/app?hl=en");
  assert.match(calls[0].url, /StreamGenerate/);
  assert.equal(calls[0].init.method, "POST");
});

test("Gemini RPC send_prompt maps non-200 HTTP responses to existing consumer error codes", async () => {
  const result = await webAiGeminiSendPromptRpc({
    profile: "gemini-9225",
    prompt: "what is 2+2?",
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate(),
    __fetch: async () => ({ ok: false, status: 500, text: async () => "server error" })
  });

  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
});

test("Gemini RPC send_prompt maps malformed streams to INVALID_JSON", async () => {
  const result = await webAiGeminiSendPromptRpc({
    profile: "gemini-9225",
    prompt: "what is 2+2?",
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate(),
    __fetch: async () => ({ ok: true, status: 200, text: async () => ")]}'\n\nnot-json" })
  });

  assert.equal(result.errorCode, "INVALID_JSON");
  assert.equal(result.error_code, "INVALID_JSON");
  assert.equal(result.completion_detected, false);
});
