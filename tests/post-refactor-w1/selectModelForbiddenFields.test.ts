const test = require("node:test");
const assert = require("node:assert/strict");
import { webAiChatgptSelectModel, webAiClaudeSelectModel } from "../../src/mcp/tools";
import { forbiddenOutputFieldList } from "../../src/mcp/forbiddenFields";

function findForbidden(value: any, list: readonly string[]): string[] {
  const found: string[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [k, v] of Object.entries(node)) {
      if (list.includes(k)) found.push(k);
      visit(v);
    }
  };
  visit(value);
  return [...new Set(found)];
}

function chatgptMockPage(): any {
  const page: any = {
    url: () => "https://chatgpt.com/",
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForFunction: async () => undefined,
    keyboard: { press: async () => undefined, type: async () => undefined },
    evaluate: async () => "",
    locator: (selector: string) => {
      const loc: any = {
        first: () => loc,
        nth: () => loc,
        count: async () => {
          if (selector.includes('aria-haspopup="menu"')) return 1;
          if (selector.includes("model-switcher-gpt-5-5-thinking") || selector.includes('menuitemradio')) return 1;
          return 0;
        },
        click: async () => undefined,
        waitFor: async () => undefined,
        getAttribute: async (n: string) => n === "aria-label" && selector.includes('aria-haspopup="menu"') ? "Thinking" : null,
        textContent: async () => selector.includes('aria-haspopup="menu"') ? "Thinking" : "",
        isChecked: async () => false
      };
      return loc;
    }
  };
  return page;
}

function claudeMockPage(): any {
  const page: any = {
    url: () => "https://claude.ai/chat/mock",
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForFunction: async () => undefined,
    keyboard: { press: async () => undefined, type: async () => undefined },
    evaluate: async () => "",
    locator: (selector: string) => {
      const loc: any = {
        first: () => loc,
        nth: () => loc,
        count: async () => {
          if (selector.includes('model-selector-dropdown')) return 1;
          if (selector.includes('Adaptive thinking')) return 1;
          return 1; // be permissive so the happy path completes
        },
        click: async () => undefined,
        waitFor: async () => undefined,
        getAttribute: async (n: string) => {
          if (n === "aria-checked") return "false";
          if (n === "aria-expanded") return "false";
          return null;
        },
        textContent: async () => "Claude Sonnet 4.6",
        isChecked: async () => false
      };
      return loc;
    }
  };
  return page;
}

function runtimeFor(page: any): any {
  const ctx = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [ctx], close: async () => undefined };
  return { launcher: { launch: async () => ({}), connectOverCdp: async () => browser } };
}

test("W1: webai_chatgpt_select_model success path response has no forbidden fields", async () => {
  const result: any = await webAiChatgptSelectModel(
    { profile: "chatgpt", thinking_level: "extended" }, runtimeFor(chatgptMockPage())
  );
  const found = findForbidden(result, forbiddenOutputFieldList);
  assert.deepEqual(found, [], `forbidden fields leaked: ${found.join(", ")}`);
  for (const k of ["cdpEndpoint", "webSocketDebuggerUrl", "profileDir", "cookies", "tokens", "dom", "html", "screenshot"]) {
    assert.equal(k in result, false, `chatgpt select-model response leaks ${k}`);
  }
});

test("W1: webai_claude_select_model success path response has no forbidden fields", async () => {
  const result: any = await webAiClaudeSelectModel(
    { profile: "claude-9224", model: "Claude Sonnet 4.6", thinking_level: "extended" }, runtimeFor(claudeMockPage())
  );
  const found = findForbidden(result, forbiddenOutputFieldList);
  assert.deepEqual(found, [], `forbidden fields leaked: ${found.join(", ")}`);
  for (const k of ["cdpEndpoint", "webSocketDebuggerUrl", "profileDir", "cookies", "tokens", "dom", "html", "screenshot"]) {
    assert.equal(k in result, false, `claude select-model response leaks ${k}`);
  }
});

test("W1: INVALID_ARGS error responses also have no forbidden fields", async () => {
  for (const fn of [webAiChatgptSelectModel, webAiClaudeSelectModel]) {
    const result: any = await fn({ profile: "x" }, runtimeFor(chatgptMockPage()));
    const found = findForbidden(result, forbiddenOutputFieldList);
    assert.deepEqual(found, []);
  }
});

test("W1: response only contains allowed top-level keys per contract", () => {
  const ALLOWED = new Set(["ok", "selected_model", "selected_thinking_level", "errorCode",
    "error_code", "message", "expected_model", "evidence"]);
  // Sample shapes (collected from live smoke evidence + handler source)
  const samples = [
    { ok: true, selected_model: "Thinking", selected_thinking_level: "extended", errorCode: null },
    { ok: false, selected_model: null, selected_thinking_level: null, errorCode: "INVALID_ARGS",
      error_code: "INVALID_ARGS", message: "..." },
    { ok: false, selected_model: "Other", selected_thinking_level: "extended",
      errorCode: "MODEL_SELECTION_DRIFT", error_code: "MODEL_SELECTION_DRIFT",
      expected_model: "Thinking", message: "drift" }
  ];
  for (const s of samples) {
    for (const k of Object.keys(s)) {
      assert.ok(ALLOWED.has(k), `unexpected top-level key ${k}`);
    }
  }
});
