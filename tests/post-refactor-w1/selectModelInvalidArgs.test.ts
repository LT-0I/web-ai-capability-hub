const test = require("node:test");
const assert = require("node:assert/strict");
import { webAiChatgptSelectModel, webAiClaudeSelectModel } from "../../src/mcp/tools";

function pageStub(): any {
  const page: any = {
    url: () => "https://example.invalid/",
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForFunction: async () => undefined,
    keyboard: { press: async () => undefined, type: async () => undefined },
    evaluate: async () => "",
    locator: () => ({
      first: () => ({}),
      count: async () => 0,
      click: async () => undefined,
      waitFor: async () => undefined,
      getAttribute: async () => null,
      textContent: async () => "",
      isChecked: async () => false
    })
  };
  return page;
}

function runtimeStub(): any {
  const page = pageStub();
  const context = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [context], close: async () => undefined };
  return { launcher: { launch: async () => ({}), connectOverCdp: async () => browser } };
}

const CASES: Array<{ name: string; fn: (a: any, r: any) => Promise<Record<string, unknown>> }> = [
  { name: "webai_chatgpt_select_model", fn: webAiChatgptSelectModel },
  { name: "webai_claude_select_model", fn: webAiClaudeSelectModel }
];

for (const c of CASES) {
  test(`W1: ${c.name} INVALID_ARGS when neither model nor thinking_level provided`, async () => {
    const result: any = await c.fn({ profile: "x" }, runtimeStub());
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.equal(result.error_code, "INVALID_ARGS");
    assert.match(String(result.message), /requires at least one of: model, thinking_level/);
    assert.equal(result.selected_model, null);
    assert.equal(result.selected_thinking_level, null);
  });

  test(`W1: ${c.name} INVALID_ARGS for bogus thinking_level value`, async () => {
    const result: any = await c.fn({ profile: "x", thinking_level: "bogus_value" }, runtimeStub());
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.match(String(result.message), /unsupported thinking_level/);
    assert.match(String(result.message), /auto, extended, off, low, medium, high, xhigh, max/);
  });

  test(`W1: ${c.name} INVALID_ARGS when profile missing`, async () => {
    const result: any = await c.fn({ thinking_level: "extended" }, runtimeStub());
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.match(String(result.message), /requires profile/);
  });

  test(`W1: ${c.name} INVALID_ARGS when model is empty string`, async () => {
    const result: any = await c.fn({ profile: "x", model: "   " }, runtimeStub());
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "INVALID_ARGS");
    assert.match(String(result.message), /model must be a non-empty/);
  });

  test(`W1: ${c.name} accepts thinking_level "auto" as valid (no INVALID_ARGS pre-flight)`, async () => {
    // We supply thinking_level=auto with no model: validation should accept; then either driver
    // succeeds (ok=true) or surfaces a non-INVALID_ARGS error (MODEL_SELECTION_DRIFT / ELEMENT_NOT_FOUND).
    const result: any = await c.fn({ profile: "x", thinking_level: "auto" }, runtimeStub());
    assert.notEqual(result.errorCode, "INVALID_ARGS",
      `${c.name} must accept thinking_level=auto without INVALID_ARGS`);
  });
}

test(`W1: webai_claude_select_model accepts new effort thinking_level values for effort-capable models`, async () => {
  const result: any = await webAiClaudeSelectModel({ profile: "x", model: "Opus 4.8", thinking_level: "max" }, runtimeStub());
  assert.notEqual(result.errorCode, "INVALID_ARGS");
});

test(`W1: webai_claude_select_model rejects effort thinking_level for Haiku mode-only models`, async () => {
  const result: any = await webAiClaudeSelectModel({ profile: "x", model: "Haiku 4.5", thinking_level: "max" }, runtimeStub());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.match(String(result.message), /does not support effort levels/);
});
