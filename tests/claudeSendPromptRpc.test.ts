import test from "node:test";
import assert from "node:assert/strict";

import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import {
  buildClaudeRpcPayload,
  decodeClaudeRpcSse,
  webAiClaudeSendPromptRpcWithFetch
} from "../src/mcp/claude_send_prompt_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "ef7a8aa2-fe72-4e09-8697-0bf6b5ef080d";

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
  assert.equal(result.chat_url, `https://claude.ai/chat/${CONVERSATION_UUID}`);
});

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
});

test("Claude RPC payload maps known Claude UI labels to captured model ids", () => {
  const payload: any = buildClaudeRpcPayload({ prompt: "hello", model: "Haiku 4.5", incognito: true, thinking: true });
  assert.equal(payload.prompt, "hello");
  assert.equal(payload.model, "claude-haiku-4-5-20251001");
  assert.equal(payload.create_conversation_params.model, "claude-haiku-4-5-20251001");
  assert.equal(payload.create_conversation_params.is_temporary, true);
  assert.equal(payload.create_conversation_params.paprika_mode, "extended");
});
