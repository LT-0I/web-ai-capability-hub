import test from "node:test";
import assert from "node:assert/strict";

import {
  ClaudeSelectModelRpcFetch,
  ClaudeSelectModelRpcRequest,
  buildClaudeSelectModelRpcRequests,
  normalizeClaudeRpcModel,
  webAiClaudeSelectModelRpcWithFetch
} from "../src/mcp/claude_select_model_rpc";

const ORG_UUID = "9a23efa1-be5a-4da2-8039-74492ab9877e";
const SELECTOR_STATE_URL = `/api/organizations/${ORG_UUID}/model_selector_state/chat`;

function requestBody(request: ClaudeSelectModelRpcRequest): any {
  assert.equal(request.body !== undefined, true);
  return JSON.parse(String(request.body));
}

function selectorState(model: string, thinking: Record<string, unknown>): string {
  return JSON.stringify({ id: "chat", model, thinking, thinking_by_model: [{ id: model, thinking }] });
}

test("Claude select_model RPC sends a single model_selector_state PATCH for model-only changes", async () => {
  const requests = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", model: "Haiku 4.5" }, ORG_UUID);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].purpose, "set_model_selector_state");
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].url, SELECTOR_STATE_URL);
  assert.deepEqual(requestBody(requests[0]), { model: "claude-haiku-4-5-20251001" });

  const fetchRpc: ClaudeSelectModelRpcFetch = async (request) => {
    assert.equal(request.profile, "claude-9224");
    assert.equal(request.method, "PATCH");
    assert.equal(request.url, SELECTOR_STATE_URL);
    assert.deepEqual(requestBody(request), { model: "claude-haiku-4-5-20251001" });
    return {
      status: 200,
      contentType: "application/json",
      text: selectorState("claude-haiku-4-5-20251001", { type: "mode", mode: "extended" }),
      elapsedMs: 5
    };
  };

  const result: any = await webAiClaudeSelectModelRpcWithFetch(
    { profile: "claude-9224", model: "Haiku 4.5" },
    fetchRpc,
    { orgId: ORG_UUID }
  );

  assert.equal(result.errorCode, null);
  assert.equal(result.selected_model, "claude-haiku-4-5-20251001");
  assert.equal(result.selected_thinking_level, "extended");
  assert.equal(result.http_status, 200);
});

test("Claude select_model RPC builds Opus 4.8 effort selector state", async () => {
  const expectedBody = {
    model: "claude-opus-4-8",
    thinking: { type: "effort_and_mode", effort: "max", mode: "off" }
  };
  const requests = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", model: "opus 4.8", thinking_level: "max" }, ORG_UUID);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].purpose, "set_model_selector_state");
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].url, SELECTOR_STATE_URL);
  assert.deepEqual(requestBody(requests[0]), expectedBody);

  const result: any = await webAiClaudeSelectModelRpcWithFetch(
    { profile: "claude-9224", model: "opus 4.8", thinking_level: "max" },
    async (request) => {
      assert.deepEqual(requestBody(request), expectedBody);
      return {
        status: 200,
        contentType: "application/json",
        text: selectorState("claude-opus-4-8", { type: "effort_and_mode", effort: "max", mode: "off" }),
        elapsedMs: 6
      };
    },
    { orgId: ORG_UUID }
  );

  assert.equal(result.errorCode, null);
  assert.equal(result.selected_model, "claude-opus-4-8");
  assert.equal(result.selected_thinking_level, "max");
  assert.equal(result.http_status, 200);
});

test("Claude select_model RPC builds thinking-only effort_and_mode bodies", () => {
  const effortOnly = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", thinking_level: "low" }, ORG_UUID);
  assert.deepEqual(requestBody(effortOnly[0]), {
    thinking: { type: "effort_and_mode", effort: "low", mode: "off" }
  });

  const modeOnly = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", thinking_level: "auto" }, ORG_UUID);
  assert.deepEqual(requestBody(modeOnly[0]), {
    thinking: { type: "effort_and_mode", effort: "high", mode: "auto" }
  });
});

test("Claude select_model RPC builds Haiku mode-only thinking and rejects Haiku effort", async () => {
  const requests = buildClaudeSelectModelRpcRequests({ profile: "claude-9224", model: "Haiku 4.5", thinking_level: "extended" }, ORG_UUID);
  assert.deepEqual(requestBody(requests[0]), {
    model: "claude-haiku-4-5-20251001",
    thinking: { type: "mode", mode: "extended" }
  });

  assert.throws(
    () => buildClaudeSelectModelRpcRequests({ profile: "claude-9224", model: "Haiku 4.5", thinking_level: "max" }, ORG_UUID),
    /does not support effort levels/
  );

  const result: any = await webAiClaudeSelectModelRpcWithFetch(
    { profile: "claude-9224", model: "Haiku 4.5", thinking_level: "max" },
    async () => { throw new Error("fetch should not run"); },
    { orgId: ORG_UUID }
  );
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.match(String(result.message), /does not support effort levels/);
});

test("Claude select_model RPC maps strict server thinking validation to MODEL_SELECTION_DRIFT", async () => {
  const result: any = await webAiClaudeSelectModelRpcWithFetch(
    { profile: "claude-9224", model: "Sonnet 4.6", thinking_level: "extended" },
    async () => ({
      status: 400,
      contentType: "application/json",
      text: JSON.stringify({
        error: {
          details: { error_code: "thinking_not_available" },
          message: "thinking mode \"extended\" is not available for this model"
        }
      }),
      elapsedMs: 3
    }),
    { orgId: ORG_UUID }
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "MODEL_SELECTION_DRIFT");
  assert.equal(result.error_code, "MODEL_SELECTION_DRIFT");
  assert.equal(result.http_status, 400);
});

test("Claude select_model RPC normalizes UI labels to Claude model ids", () => {
  assert.equal(normalizeClaudeRpcModel("Haiku 4.5"), "claude-haiku-4-5-20251001");
  assert.equal(normalizeClaudeRpcModel("Sonnet 4.6"), "claude-sonnet-4-6");
  assert.equal(normalizeClaudeRpcModel("opus"), "claude-opus-4-8");
  assert.equal(normalizeClaudeRpcModel("opus 4.8"), "claude-opus-4-8");
  assert.equal(normalizeClaudeRpcModel("claude opus 4.7"), "claude-opus-4-7");
  assert.equal(normalizeClaudeRpcModel("claude-opus-4-6"), "claude-opus-4-6");
});
