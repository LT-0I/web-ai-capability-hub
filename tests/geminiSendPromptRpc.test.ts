const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import {
  buildGeminiRpcFReq,
  buildGeminiRpcRequest,
  decodeGeminiStreamText,
  webAiGeminiSendPromptRpc,
  resolveGeminiSendPromptVariant,
  GeminiRpcPayloadTemplate
} from "../src/mcp/gemini_send_prompt_rpc";

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
const WAVE_B1_FIXTURE_ROOT = path.join(process.cwd(), ".runs/path-c-gemini-rpc/wave-b1-chat-send/fixtures");

function minimalGeminiStream(text: string): string {
  const nested: any[] = [];
  nested[1] = ["c_fixture", "r_fixture"];
  nested[4] = [["rc_fixture", [text], null, null, null, null, true, null, [1], "und"]];
  nested[26] = [[[[null, [null, 0, text]]]]];
  const payload = JSON.stringify([["wrb.fr", null, JSON.stringify(nested)]]);
  return `)]}'\n\n${payload.length}\n${payload}\n`;
}

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
  inner[11] = 0;
  inner[17] = [[0]];
  inner[18] = 0;
  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [1];
  inner[53] = 0;
  inner[59] = "11111111-2222-3333-4444-555555555555";
  inner[61] = [];
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

function innerFromFReq(fReq: string): any[] {
  const parsed = JSON.parse(fReq);
  return JSON.parse(parsed[1]);
}

function innerFromRequestBody(body: string): any[] {
  const fReq = new URLSearchParams(body).get("f.req");
  assert.equal(typeof fReq, "string");
  return innerFromFReq(fReq as string);
}

function loadVariantStream(variant: string, expectedText: string): string {
  const fixturePath = path.join(WAVE_B1_FIXTURE_ROOT, `${variant}.response-stream.txt`);
  if (fs.existsSync(fixturePath)) {
    const stream = fs.readFileSync(fixturePath, "utf8");
    if (decodeGeminiStreamText(stream) === expectedText) return stream;
  }
  return minimalGeminiStream(expectedText);
}

test("Gemini RPC decoder extracts assistant text from captured StreamGenerate replay", () => {
  assert.equal(decodeGeminiStreamText(CAPTURED_BASIC_STREAM), "4");
});

test("Gemini RPC request builder rewrites only the prompt slot for the basic variant", () => {
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

type VariantCase = {
  variant: string;
  args: Record<string, unknown>;
  expectedText: string;
  assertBody: (inner: any[]) => void;
};

const LIVE_CONVERSATION_TUPLE = ["c_livefixture", "r_livefixture", "rc_livefixture", null, null, null, null, null, null, "AwLIVEfixtureContextToken123456789"];

const VARIANT_CASES: VariantCase[] = [
  {
    variant: "basic",
    args: {},
    expectedText: "4",
    assertBody: (inner) => {
      assert.equal(inner[17][0][0], 0);
      assert.equal(inner[79], 1);
      assert.equal(inner[80], 1);
    }
  },
  {
    variant: "thinking_extended",
    args: { thinking: true },
    expectedText: "6",
    assertBody: (inner) => {
      assert.equal(inner[80], 2);
      assert.equal(inner[79], 1);
    }
  },
  {
    variant: "model_flash",
    args: { model: "3.5-flash" },
    expectedText: "10",
    assertBody: (inner) => {
      assert.equal(inner[79], 1);
      assert.equal(inner[80], 1);
    }
  },
  {
    variant: "model_flash_lite",
    args: { model: "3.1-flash-lite" },
    expectedText: "8",
    assertBody: (inner) => {
      assert.equal(inner[79], 6);
      assert.equal(inner[80], 1);
    }
  },
  {
    variant: "reuse_conversation",
    args: { reuse_conversation: true, __conversationTuple: LIVE_CONVERSATION_TUPLE },
    expectedText: "12",
    assertBody: (inner) => {
      assert.deepEqual(inner[2], LIVE_CONVERSATION_TUPLE);
      assert.deepEqual(inner[17], [[1]]);
    }
  }
];

for (const variantCase of VARIANT_CASES) {
  test(`Gemini RPC send_prompt ${variantCase.variant} replays Wave A stream fixture and sends variant body delta`, async () => {
    const calls: any[] = [];
    const stream = loadVariantStream(variantCase.variant, variantCase.expectedText);
    const result = await webAiGeminiSendPromptRpc({
      profile: "gemini-9225",
      prompt: `fixture prompt for ${variantCase.variant}`,
      ...variantCase.args,
      __cdpSnapshot: cdpSnapshot,
      __payloadTemplate: fixtureTemplate(),
      __fetch: async (url: string, init: any) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => stream };
      }
    });

    assert.equal(result.errorCode, null);
    assert.equal(result.completion_detected, true);
    assert.equal(result.response_text, variantCase.expectedText);
    assert.equal(resolveGeminiSendPromptVariant(variantCase.args), variantCase.variant);
    assert.match(calls[0].url, /StreamGenerate/);
    assert.equal(calls[0].init.headers.cookie, cdpSnapshot.cookieHeader);
    assert.equal(new URLSearchParams(calls[0].init.body).get("at"), cdpSnapshot.at);
    const inner = innerFromRequestBody(calls[0].init.body);
    assert.equal(inner[0][0], `fixture prompt for ${variantCase.variant}`);
    variantCase.assertBody(inner);
  });
}

test("Gemini RPC request builder applies combined model + thinking deltas", () => {
  const request = buildGeminiRpcRequest(
    { prompt: "combined", model: "3.1 Flash Lite", thinking_level: "extended", __conversationTuple: LIVE_CONVERSATION_TUPLE },
    cdpSnapshot,
    fixtureTemplate()
  );
  const inner = innerFromRequestBody(request.body);
  assert.equal(inner[79], 6);
  assert.equal(inner[80], 2);
});

test("Gemini RPC send_prompt marks non-verified Web Search variants RPC_NOT_AVAILABLE without DOM fallback", async () => {
  const result = await webAiGeminiSendPromptRpc({
    profile: "gemini-9225",
    prompt: "search this",
    web_search: true,
    __cdpSnapshot: cdpSnapshot,
    __payloadTemplate: fixtureTemplate(),
    __fetch: async () => { throw new Error("fetch should not run for RPC_NOT_AVAILABLE web_search"); }
  });

  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.equal(result.error_code, "INVALID_ARGS");
  assert.match(String(result.message), /RPC_NOT_AVAILABLE/);
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
