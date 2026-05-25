const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { listMcpTools } from "../../src/mcp/tools";

const CONTRACT_PATH = path.resolve(process.cwd(), "configs/consumer-contract.json");
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf-8"));
const GOLDEN_PATH = path.resolve(process.cwd(), "tests/golden/listMcpTools.196.json");
const GOLDEN = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf-8"));

const W1_CASES = [
  { cli: "webai:chatgpt:select-model", mcp: "webai_chatgpt_select_model", ts: "webAiChatgptSelectModel" },
  { cli: "webai:claude:select-model", mcp: "webai_claude_select_model", ts: "webAiClaudeSelectModel" }
];
const GEMINI_REFERENCE = "webai_gemini_select_model";

const EXPECTED_OUTPUT_KEYS = ["ok", "selected_model", "selected_thinking_level", "errorCode"];

test("W1: chatgpt+claude select_model contract rows mirror gemini's shape", () => {
  const geminiRow = CONTRACT.commands.find((c: any) => c.mcp_name === GEMINI_REFERENCE);
  assert.ok(geminiRow, "gemini reference row missing");

  for (const c of W1_CASES) {
    const row = CONTRACT.commands.find((r: any) => r.mcp_name === c.mcp);
    assert.ok(row, `${c.mcp} contract row missing`);
    assert.equal(row.cli_name, c.cli);
    assert.equal(row.ts_export, c.ts);
    assert.equal(row.safety_class, "mutate", `${c.mcp} must be safety_class=mutate`);
    assert.equal(row.maturity, "experimental", `${c.mcp} must be maturity=experimental`);
    assert.deepEqual(row.required_args, ["profile"]);
    assert.ok(Array.isArray(row.optional_args));
    for (const arg of ["model", "thinking_level"]) {
      assert.ok(row.optional_args.includes(arg), `${c.mcp} optional_args missing ${arg}`);
    }
    assert.deepEqual(row.output_keys.always_present, EXPECTED_OUTPUT_KEYS);
    assert.deepEqual(row.output_keys.always_present, geminiRow.output_keys.always_present,
      `${c.mcp} output_keys must mirror gemini`);
    assert.equal(row.may_contain_sensitive_local_fields, false);
  }
});

test("Phase8: contract bumped to 2.1.0 with 192 commands and 41 webai_ rows", () => {
  assert.equal(CONTRACT.contract_version, "consumer-contract-2.1.0");
  assert.equal(CONTRACT.commands.length, 192);
  const webai = CONTRACT.commands.filter((c: any) => typeof c.mcp_name === "string" && c.mcp_name.startsWith("webai_"));
  assert.equal(webai.length, 41);
});

test("W1: both new tools surfaced via listMcpTools() with input schemas", () => {
  const tools = listMcpTools();
  for (const c of W1_CASES) {
    const tool: any = tools.find((t: any) => t.name === c.mcp);
    assert.ok(tool, `${c.mcp} not surfaced by listMcpTools()`);
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 0);
    const schema: any = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.required, ["profile"]);
    for (const prop of ["profile", "model", "thinking_level", "tab_url_contains", "url", "timeout_ms"]) {
      assert.ok(schema.properties[prop], `${c.mcp} inputSchema missing property ${prop}`);
    }
    assert.equal(schema.properties.profile.type, "string");
    assert.equal(schema.properties.timeout_ms.type, "number");
  }
});

test("W1: golden listMcpTools.196.json contains both new tools alphabetically", () => {
  const names = GOLDEN.tools.map((t: any) => t.name);
  for (const c of W1_CASES) {
    assert.ok(names.includes(c.mcp), `golden missing ${c.mcp}`);
  }
  assert.equal(GOLDEN.tools.length, 196);
  const webaiNames = names.filter((n: string) => n.startsWith("webai_"));
  const sorted = [...webaiNames].sort();
  assert.deepEqual(webaiNames, sorted, "webai_ tools in golden are not alphabetically sorted");
});
