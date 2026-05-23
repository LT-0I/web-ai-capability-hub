import "../../src/mcp/tools"; // force module-mode so const declarations don't collide with sibling test files
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CLI_SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");

test("W1: src/cli.ts maps webai:chatgpt:select-model -> webai_chatgpt_select_model", () => {
  assert.match(CLI_SOURCE, /["']webai:chatgpt:select-model["']\s*:\s*["']webai_chatgpt_select_model["']/,
    "missing CLI -> MCP mapping for chatgpt select-model");
});

test("W1: src/cli.ts maps webai:claude:select-model -> webai_claude_select_model", () => {
  assert.match(CLI_SOURCE, /["']webai:claude:select-model["']\s*:\s*["']webai_claude_select_model["']/,
    "missing CLI -> MCP mapping for claude select-model");
});

test("W1: chatgpt+claude select-model usage line appears in src/cli.ts help text", () => {
  assert.match(CLI_SOURCE, /webai:chatgpt:select-model.*webai:claude:select-model/s,
    "src/cli.ts help block missing chatgpt+claude select-model usage line");
});
