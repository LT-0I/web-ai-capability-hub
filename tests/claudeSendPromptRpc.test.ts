import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  buildClaudeRpcPayload,
  decodeClaudeRpcSse,
  webAiClaudeSendPromptRpcWithFetch
} from "../src/mcp/claude_send_prompt_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "ef7a8aa2-fe72-4e09-8697-0bf6b5ef080d";
const PARENT_MESSAGE_UUID = "019e69ce-2823-78b0-aed2-3f27b6752660";
const CAPTURE_ROOT = path.join(process.cwd(), ".runs/path-c-claude-rpc/wave-a-captures");

// Captured Claude completion SSE shape from .runs/claude-rpc-spike/replay/
// browser-fetch-minimal-headers.stream.txt; shortened to the text-delta-bearing
// records so the test remains self-contained after this validation branch lands.
const CAPTURED_CLAUDE_SSE = [
  "event: conversation_ready",
  "data: {\"type\":\"conversation_ready\"}",
  "",
  "event: message_start",
  "data: {\"type\":\"message_start\",\"message\":{\"id\":\"chatcompl_fixture\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-sonnet-4-6\",\"content\":[]}}",
  "",
  "event: content_block_start",
  "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
  "",
  "event: content_block_delta",
  "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" 2\"}}",
  "",
  "event: content_block_stop",
  "data: {\"type\":\"content_block_stop\",\"index\":0}",
  "",
  "event: message_stop",
  "data: {\"type\":\"message_stop\"}",
  ""
].join("\n");

function minimalSse(text = " OK", model = "claude-sonnet-4-6"): string {
  return [
    "event: conversation_ready",
    "data: {\"type\":\"conversation_ready\"}",
    "",
    "event: message_start",
    `data: ${JSON.stringify({ type: "message_start", message: { id: "chatcompl_fixture", type: "message", role: "assistant", model, uuid: PARENT_MESSAGE_UUID, content: [] } })}`,
    "",
    "event: content_block_start",
    "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
    "",
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}`,
    "",
    "event: content_block_stop",
    "data: {\"type\":\"content_block_stop\",\"index\":0}",
    "",
    "event: message_stop",
    "data: {\"type\":\"message_stop\"}",
    ""
  ].join("\n");
}

function captureDir(variant: string): string {
  return path.join(CAPTURE_ROOT, `webai_claude_send_prompt--${variant}`);
}

function eventsJsonToSse(events: Array<{ event?: string; data?: unknown }>): string {
  return events
    .map((event) => `${event.event ? `event: ${event.event}\n` : ""}data: ${JSON.stringify(event.data ?? {})}\n\n`)
    .join("");
}

function loadCaptureSummary(variant: string): any | null {
  const summaryPath = path.join(captureDir(variant), "capture-summary.json");
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
}

function loadCaptureRequestBody(variant: string): any | null {
  const bodyPath = path.join(captureDir(variant), "request-body.txt");
  if (!fs.existsSync(bodyPath)) return null;
  return JSON.parse(fs.readFileSync(bodyPath, "utf8"));
}

function loadCapturedSse(variant: string, fallbackText = " OK", fallbackModel = "claude-sonnet-4-6"): string {
  const responseJsonPath = path.join(captureDir(variant), "response-stream.json");
  if (fs.existsSync(responseJsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(responseJsonPath, "utf8"));
    if (Array.isArray(parsed.events) && parsed.events.length) return eventsJsonToSse(parsed.events);
  }
  // model_sonnet primary response-stream.json is empty, but Wave A replay verified the same request body.
  const replayPath = path.join(captureDir(variant), "replay/response-stream.txt");
  if (fs.existsSync(replayPath)) return fs.readFileSync(replayPath, "utf8");
  return minimalSse(fallbackText, fallbackModel);
}

function capturedAssistantText(variant: string, fallbackText = " OK"): string {
  const responseJsonPath = path.join(captureDir(variant), "response-stream.json");
  if (fs.existsSync(responseJsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(responseJsonPath, "utf8"));
    if (typeof parsed.assistant_text === "string" && parsed.assistant_text) return parsed.assistant_text;
  }
  const summary = loadCaptureSummary(variant);
  const replayText = summary?.replay?.decoded?.assistant_text;
  return typeof replayText === "string" && replayText ? replayText : fallbackText;
}

function hasWebSearchTool(payload: any): boolean {
  return Array.isArray(payload.tools) && payload.tools.some((tool: any) => tool?.name === "web_search" || tool?.type === "web_search_v0");
}

type VariantCase = {
  variant: string;
  args: Record<string, unknown>;
  expectedModel?: string;
  expectedText?: string;
  assertPayload: (payload: any) => void;
};

const VARIANTS: VariantCase[] = [
  {
    variant: "basic",
    args: {},
    assertPayload: (payload) => {
      assert.equal(payload.model, "claude-sonnet-4-6");
      assert.equal(payload.create_conversation_params.model, "claude-sonnet-4-6");
      assert.equal(payload.create_conversation_params.paprika_mode, null);
      assert.equal(payload.personalized_styles[0].key, "Default");
      assert.equal(hasWebSearchTool(payload), false);
    }
  },
  {
    variant: "thinking",
    args: { thinking: true },
    assertPayload: (payload) => {
      assert.equal(payload.create_conversation_params.paprika_mode, "extended");
      assert.equal(hasWebSearchTool(payload), false);
    }
  },
  {
    variant: "web_search",
    args: { web_search: true },
    assertPayload: (payload) => {
      assert.equal(hasWebSearchTool(payload), true);
    }
  },
  {
    variant: "style_concise",
    args: { style: "concise" },
    assertPayload: (payload) => {
      assert.equal(payload.personalized_styles[0].key, "Concise");
      assert.equal(payload.personalized_styles[0].nameKey, "concise_style_name");
      assert.equal(payload.personalized_styles[0].summaryKey, "concise_style_summary");
      assert.equal(payload.personalized_styles[0].isDefault, false);
    }
  },
  {
    variant: "style_explanatory",
    args: { style: "explanatory" },
    expectedText: " What would you like explained?",
    assertPayload: (payload) => {
      assert.equal(payload.personalized_styles[0].key, "Explanatory");
      assert.equal(payload.personalized_styles[0].nameKey, "explanatory_style_name");
      assert.equal(payload.personalized_styles[0].summaryKey, "explanatory_style_summary");
      assert.equal(payload.personalized_styles[0].isDefault, false);
    }
  },
  {
    variant: "incognito",
    args: { incognito: true },
    assertPayload: (payload) => {
      assert.equal(payload.create_conversation_params.is_temporary, false);
      assert.equal(payload.create_conversation_params.model, "claude-sonnet-4-6");
    }
  },
  {
    variant: "model_haiku",
    args: { model: "Haiku 4.5" },
    expectedModel: "claude-haiku-4-5-20251001",
    assertPayload: (payload) => {
      assert.equal(payload.model, "claude-haiku-4-5-20251001");
      assert.equal(payload.create_conversation_params.model, "claude-haiku-4-5-20251001");
    }
  },
  {
    variant: "model_sonnet",
    args: { model: "Sonnet 4.6" },
    expectedModel: "claude-sonnet-4-6",
    assertPayload: (payload) => {
      assert.equal(payload.model, "claude-sonnet-4-6");
      assert.equal(payload.create_conversation_params.model, "claude-sonnet-4-6");
    }
  },
  {
    variant: "reuse_conversation",
    args: { reuse_conversation: true, parent_message_uuid: PARENT_MESSAGE_UUID },
    assertPayload: (payload) => {
      assert.equal(payload.parent_message_uuid, PARENT_MESSAGE_UUID);
      assert.equal(Object.prototype.hasOwnProperty.call(payload, "create_conversation_params"), false);
    }
  },
  {
    variant: "attachment_mode_none",
    args: { attachment_mode: "none" },
    assertPayload: (payload) => {
      assert.deepEqual(payload.attachments, []);
      assert.deepEqual(payload.files, []);
      assert.deepEqual(payload.sync_sources, []);
    }
  }
];

test("Claude RPC SSE decoder reassembles captured text deltas", () => {
  assert.equal(decodeClaudeRpcSse(CAPTURED_CLAUDE_SSE), " 2");
});

test("Claude RPC send_prompt fixture replay returns DOM-shaped success output", async () => {
  const result: any = await webAiClaudeSendPromptRpcWithFetch(
    { profile: "claude-9224", prompt: "what is 1+1?" },
    async (request) => {
      assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/chat_conversations/${CONVERSATION_UUID}/completion$`));
      const payload: any = JSON.parse(request.body);
      assert.equal(payload.prompt, "what is 1+1?");
      assert.equal(payload.model, "claude-sonnet-4-6");
      assert.match(payload.turn_message_uuids.human_message_uuid, /^[0-9a-f-]{36}$/i);
      return {
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        text: CAPTURED_CLAUDE_SSE,
        elapsedMs: 42
      };
    },
    { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
  );

  assert.equal(result.errorCode, null);
  assert.equal(result.response_text, " 2");
  assert.equal(result.wait_ms, 42);
  assert.equal(result.completion_detected, true);
  assert.equal(result.conversation_id, CONVERSATION_UUID);
  assert.equal(result.chat_url, `https://claude.ai/chat/${CONVERSATION_UUID}`);
  assert.equal(result.model_used, "claude-sonnet-4-6");
  assert.equal(result.http_status, 200);
});

for (const variantCase of VARIANTS) {
  test(`Claude RPC send_prompt ${variantCase.variant} replays captured stream and sends variant body delta`, async () => {
    const capturedBody = loadCaptureRequestBody(variantCase.variant);
    const expectedModel = variantCase.expectedModel || capturedBody?.model || "claude-sonnet-4-6";
    const expectedText = variantCase.expectedText || capturedAssistantText(variantCase.variant);
    const sse = loadCapturedSse(variantCase.variant, expectedText, expectedModel);
    let sentPayload: any;

    const result: any = await webAiClaudeSendPromptRpcWithFetch(
      { profile: "claude-9224", prompt: `fixture prompt for ${variantCase.variant}`, ...variantCase.args },
      async (request) => {
        assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/chat_conversations/${CONVERSATION_UUID}/completion$`));
        sentPayload = JSON.parse(request.body);
        return {
          status: 200,
          contentType: "text/event-stream; charset=utf-8",
          text: sse,
          elapsedMs: 30
        };
      },
      {
        orgId: ORG_UUID,
        conversationId: CONVERSATION_UUID,
        ...(variantCase.variant === "reuse_conversation" ? { parentMessageUuid: PARENT_MESSAGE_UUID } : {})
      }
    );

    assert.equal(result.errorCode, null);
    assert.equal(result.response_text, expectedText);
    assert.equal(result.conversation_id, CONVERSATION_UUID);
    assert.equal(result.chat_url, `https://claude.ai/chat/${CONVERSATION_UUID}`);
    assert.equal(result.model_used, expectedModel);
    assert.equal(result.http_status, 200);
    assert.equal(sentPayload.prompt, `fixture prompt for ${variantCase.variant}`);
    assert.equal(sentPayload.rendering_mode, "messages");
    assert.match(sentPayload.turn_message_uuids.human_message_uuid, /^[0-9a-f-]{36}$/i);
    assert.match(sentPayload.turn_message_uuids.assistant_message_uuid, /^[0-9a-f-]{36}$/i);
    variantCase.assertPayload(sentPayload);
  });
}

test("Claude RPC send_prompt maps non-200 auth failures to existing LOGIN_REQUIRED code", async () => {
  const result: any = await webAiClaudeSendPromptRpcWithFetch(
    { profile: "claude-9224", prompt: "hello" },
    async () => ({
      status: 403,
      contentType: "application/json",
      text: "{\"type\":\"error\",\"error\":{\"type\":\"permission_error\",\"message\":\"Invalid authorization\"}}"
    }),
    { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
  );

  assert.equal(result.errorCode, ConsumerErrorCodes.LOGIN_REQUIRED);
  assert.equal(result.error_code, ConsumerErrorCodes.LOGIN_REQUIRED);
  assert.equal(result.http_status, 403);
  assert.equal(result.completion_detected, false);
});

test("Claude RPC send_prompt maps malformed SSE to existing INVALID_JSON code", async () => {
  const result: any = await webAiClaudeSendPromptRpcWithFetch(
    { profile: "claude-9224", prompt: "hello" },
    async () => ({
      status: 200,
      contentType: "text/event-stream",
      text: "event: content_block_delta\ndata: {not json}\n\n"
    }),
    { orgId: ORG_UUID, conversationId: CONVERSATION_UUID }
  );

  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_JSON);
  assert.equal(result.error_code, ConsumerErrorCodes.INVALID_JSON);
  assert.equal(result.http_status, 200);
});

test("Claude RPC payload maps known Claude UI labels to captured model ids and flags", () => {
  const payload: any = buildClaudeRpcPayload({ prompt: "hello", model: "Haiku 4.5", incognito: true, thinking: true });
  assert.equal(payload.prompt, "hello");
  assert.equal(payload.model, "claude-haiku-4-5-20251001");
  assert.equal(payload.create_conversation_params.model, "claude-haiku-4-5-20251001");
  assert.equal(payload.create_conversation_params.is_temporary, false);
  assert.equal(payload.create_conversation_params.paprika_mode, "extended");
});
