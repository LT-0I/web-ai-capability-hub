import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeDeepResearchPayload,
  ClaudeDeepResearchRpcFetch,
  webAiClaudeDeepResearchRpcWithFetch
} from "../src/mcp/claude_deep_research_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const CONVERSATION_UUID = "284f2596-41be-415b-a21f-86cb12ae077e";
const RESEARCH_STREAM = [
  { type: "message_start", message: { model: "claude-sonnet-4-6", uuid: "33333333-3333-4333-8333-333333333333" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll start a brief research task." } },
  { type: "message_stop" }
].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

test("Claude deep_research RPC payload sets captured advanced compass mode", () => {
  const payload: any = buildClaudeDeepResearchPayload({ prompt: "research this", model: "Sonnet 4.6" });
  assert.equal(payload.prompt, "research this");
  assert.equal(payload.model, "claude-sonnet-4-6");
  assert.equal(payload.create_conversation_params.compass_mode, "advanced");
  assert.equal(payload.create_conversation_params.paprika_mode, null);
});

test("Claude deep_research RPC start returns queued DOM-compatible task envelope", async () => {
  const stream = RESEARCH_STREAM;
  let body: any = null;
  const fetchRpc: ClaudeDeepResearchRpcFetch = async (request) => {
    assert.match(request.url, new RegExp(`/api/organizations/${ORG_UUID}/chat_conversations/${CONVERSATION_UUID}/completion$`));
    body = JSON.parse(request.body);
    return { status: 200, contentType: "text/event-stream; charset=utf-8", text: stream, elapsedMs: 57 };
  };

  const result: any = await webAiClaudeDeepResearchRpcWithFetch(
    { profile: "claude-9224", prompt: "RPC_CLAUDE_DEEP_RESEARCH_2026-05-27: Start a minimal research task and reply/queue succinctly.", model: "Sonnet 4.6" },
    fetchRpc,
    { orgId: ORG_UUID, conversationId: CONVERSATION_UUID, taskId: "claude_research_fixture" }
  );

  assert.equal(body.create_conversation_params.compass_mode, "advanced");
  assert.equal(result.errorCode, null);
  assert.equal(result.task_id, "claude_research_fixture");
  assert.equal(result.status, "queued");
  assert.equal(result.chat_url, `https://claude.ai/chat/${CONVERSATION_UUID}`);
  assert.equal(result.wait_ms, 57);
  assert.equal(result.http_status, 200);
});
