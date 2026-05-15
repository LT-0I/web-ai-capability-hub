const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { consumerHealth, ConsumerHealthResult } from "../src/consumer/health";
import { CONSUMER_ERROR_CODES } from "../src/consumer/errorCodes";
import { ManagedBrowserLauncher, ManagedBrowserStatus } from "../src/browser/managedLauncher";
import { main } from "../src/cli";
import { listMcpResources } from "../src/mcp/resources";
import { callMcpTool, listMcpTools, webAiChatgptSendPrompt, webAiClaudeSendPrompt, webAiGeminiSendPrompt, webAiChatgptUploadAndQuery, webAiClaudeUploadAndQuery, webAiGeminiUploadAndQuery, webAiChatgptGenerateFile, webAiClaudeGenerateFile, webAiChatgptGenerateImage, webAiGeminiGenerateImage, webAiGeminiCanvasToDocs, webAiGeminiGenerateVideo, webAiTaskStatus } from "../src/mcp/tools";

type Scenario = {
  name: string;
  input: { target: string; profile: string };
  status?: ManagedBrowserStatus;
  timeout?: boolean;
  expected: Partial<ConsumerHealthResult>;
  forbiddenSentinels: string[];
};

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf-8"));
}

function contract(): any { return readJson("configs/consumer-contract.json"); }
function fixtures(): { checkedAt: string; scenarios: Scenario[] } { return readJson("tests/fixtures/consumer-health-scenarios.json"); }

function launcherForScenario(scenario: Scenario): any {
  if (scenario.timeout) return { status: async () => new Promise(() => undefined) };
  return { status: async () => scenario.status };
}

function assertNoForbiddenFields(value: unknown, forbiddenFields: string[]): void {
  const seen: string[] = [];
  function visit(node: any): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenFields.includes(key)) seen.push(key);
      visit(child);
    }
  }
  visit(value);
  assert.deepEqual(seen, []);
}

function assertNoSentinelValues(value: unknown, sentinels: string[]): void {
  const serialized = JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(serialized.includes(sentinel), false, `leaked sentinel: ${sentinel}`);
  }
}

function assertConsumerHealthSchema(value: ConsumerHealthResult, alwaysPresent: string[]): void {
  assert.deepEqual(Object.keys(value), alwaysPresent);
  assert.equal(typeof value.ok, "boolean");
  assert.equal(typeof value.target, "string");
  assert.equal(typeof value.profile, "string");
  assert.equal(typeof value.connected, "boolean");
  assert.equal(typeof value.pageCount, "number");
  assert.ok(["healthy", "unhealthy", "not_implemented"].includes(value.loginLikeState));
  assert.ok(["ok", "missing", "blocked", "needs_review"].includes(value.status));
  assert.ok(value.errorCode === null || (CONSUMER_ERROR_CODES as readonly string[]).includes(value.errorCode));
  assert.equal(typeof value.message, "string");
  assert.equal(Number.isNaN(Date.parse(value.checkedAt)), false);
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: any[]) => { lines.push(args.join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

test("consumer:health output schema matches contract and strips forbidden fields for fixtures", async () => {
  const manifest = contract();
  const healthCommand = manifest.commands.find((command: any) => command.cli_name === "consumer:health");
  assert.ok(healthCommand, "consumer:health missing from contract manifest");
  const alwaysPresent = healthCommand.output_keys.always_present;

  for (const scenario of fixtures().scenarios) {
    const result = await consumerHealth({
      ...scenario.input,
      launcher: launcherForScenario(scenario),
      timeoutMs: scenario.timeout ? 5 : 100,
      now: () => new Date(fixtures().checkedAt)
    });

    assertConsumerHealthSchema(result, alwaysPresent);
    assert.equal(result.target, scenario.input.target, scenario.name);
    assert.equal(result.profile, scenario.input.profile, scenario.name);
    for (const [key, expected] of Object.entries(scenario.expected)) {
      assert.deepEqual((result as any)[key], expected, `${scenario.name}:${key}`);
    }
    assertNoForbiddenFields(result, manifest.forbidden_output_fields);
    assertNoSentinelValues(result, scenario.forbiddenSentinels);
  }
});

test("consumer:health CLI emits the safe contract shape", async (t: any) => {
  const originalStatus = ManagedBrowserLauncher.prototype.status;
  const scenario = fixtures().scenarios.find((item) => item.name === "connected-chatgpt-page")!;
  ManagedBrowserLauncher.prototype.status = async function() { return scenario.status as ManagedBrowserStatus; };
  t.after(() => { ManagedBrowserLauncher.prototype.status = originalStatus; });

  const stdout = await captureStdout(() => main(["consumer:health", "--target", "chatgpt", "--profile", "chatgpt", "--json"]));
  const parsed = JSON.parse(stdout);
  const alwaysPresent = contract().commands.find((command: any) => command.cli_name === "consumer:health").output_keys.always_present;

  assertConsumerHealthSchema(parsed, alwaysPresent);
  assert.equal(parsed.ok, true);
  assertNoForbiddenFields(parsed, contract().forbidden_output_fields);
  assertNoSentinelValues(parsed, scenario.forbiddenSentinels);
});

test("consumer contract manifest is internally consistent", async () => {
  const manifest = contract();
  const packageJson = readJson("package.json");
  const cliSource = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");
  const mcpToolNames = new Set(listMcpTools().map((tool) => tool.name));
  const resourceUris = new Set(listMcpResources().map((resource) => resource.uri));

  assert.equal(manifest.package_version, packageJson.version);
  assert.equal(manifest.contract_version, "consumer-contract-1.3.0");
  assert.deepEqual(manifest.error_codes, [...CONSUMER_ERROR_CODES]);
  assert.equal(manifest.error_codes.length, 29);

  for (const code of ["IFRAME_NOT_FOUND", "ELEMENT_OUT_OF_VIEWPORT", "ARTIFACT_DOWNLOAD_TIMEOUT", "ARTIFACT_VERIFICATION_FAILED", "DOCX_VERIFICATION_FAILED", "POSTCONDITION_TIMEOUT", "RESUME_REQUIRES_CONFIRMATION", "IDEMPOTENCY_MISMATCH", "PROFILE_LOCKED", "PROFILE_LEASE_BUSY", "AUTO_PUBLISH_DETECTED", "ARTIFACT_MODE_UNSUPPORTED", "MODEL_SELECTION_DRIFT", "PLAN_OR_QUOTA_REQUIRED", "SAFE_OUTPUT_REDACTION_REQUIRED", "MODE_UNCERTAIN", "HUMAN_HANDOFF_REQUIRED"]) {
    assert.ok(manifest.error_codes.includes(code), `missing error code ${code}`);
  }
  for (const cliName of ["browser:artifact-click", "browser:click", "browser:upload", "browser:wait", "workflow:run", "browser:audit", "verify:docx-min"]) {
    assert.ok(manifest.commands.find((command: any) => command.cli_name === cliName), `missing command row ${cliName}`);
  }
  assert.ok(manifest.sensitive_fields["artifact_click.path"]);

  for (const command of manifest.commands) {
    assert.ok(cliSource.includes(`"${command.cli_name}"`), `${command.cli_name} does not resolve in CLI source`);
    assert.ok(["stable", "experimental", "placeholder"].includes(command.maturity), `${command.cli_name} maturity`);
    assert.ok(["read", "mutate", "risky"].includes(command.safety_class), `${command.cli_name} safety_class`);
    assert.equal(typeof command.may_contain_sensitive_local_fields, "boolean", `${command.cli_name} sensitivity flag`);
    assert.ok(Array.isArray(command.required_args), `${command.cli_name} required_args`);
    assert.ok(Array.isArray(command.output_keys.always_present), `${command.cli_name} always_present`);
    assert.ok(Array.isArray(command.output_keys.optional), `${command.cli_name} optional`);
    if (command.mcp_name) assert.ok(mcpToolNames.has(command.mcp_name), `${command.mcp_name} missing from MCP tools`);
  }

  for (const resource of manifest.resources) {
    assert.ok(resourceUris.has(resource.uri), `${resource.uri} missing from MCP resources`);
    assert.ok(["stable", "experimental", "placeholder"].includes(resource.maturity), `${resource.uri} maturity`);
    assert.ok(["read", "mutate", "risky"].includes(resource.safety_class), `${resource.uri} safety_class`);
  }

  const healthCommand = manifest.commands.find((command: any) => command.cli_name === "consumer:health");
  const result = await consumerHealth({
    target: "chatgpt",
    profile: "chatgpt",
    launcher: launcherForScenario(fixtures().scenarios[0]),
    now: () => new Date(fixtures().checkedAt)
  });
  assert.deepEqual(Object.keys(result), healthCommand.output_keys.always_present);
});


const webAiV13Tools = [
  { cli: "webai:chatgpt:send-prompt", mcp: "webai_chatgpt_send_prompt", ts: "webAiChatgptSendPrompt", fn: webAiChatgptSendPrompt },
  { cli: "webai:claude:send-prompt", mcp: "webai_claude_send_prompt", ts: "webAiClaudeSendPrompt", fn: webAiClaudeSendPrompt },
  { cli: "webai:gemini:send-prompt", mcp: "webai_gemini_send_prompt", ts: "webAiGeminiSendPrompt", fn: webAiGeminiSendPrompt },
  { cli: "webai:chatgpt:upload-and-query", mcp: "webai_chatgpt_upload_and_query", ts: "webAiChatgptUploadAndQuery", fn: webAiChatgptUploadAndQuery },
  { cli: "webai:claude:upload-and-query", mcp: "webai_claude_upload_and_query", ts: "webAiClaudeUploadAndQuery", fn: webAiClaudeUploadAndQuery },
  { cli: "webai:gemini:upload-and-query", mcp: "webai_gemini_upload_and_query", ts: "webAiGeminiUploadAndQuery", fn: webAiGeminiUploadAndQuery },
  { cli: "webai:chatgpt:generate-file", mcp: "webai_chatgpt_generate_file", ts: "webAiChatgptGenerateFile", fn: webAiChatgptGenerateFile },
  { cli: "webai:claude:generate-file", mcp: "webai_claude_generate_file", ts: "webAiClaudeGenerateFile", fn: webAiClaudeGenerateFile },
  { cli: "webai:chatgpt:generate-image", mcp: "webai_chatgpt_generate_image", ts: "webAiChatgptGenerateImage", fn: webAiChatgptGenerateImage },
  { cli: "webai:gemini:generate-image", mcp: "webai_gemini_generate_image", ts: "webAiGeminiGenerateImage", fn: webAiGeminiGenerateImage },
  { cli: "webai:gemini:canvas-to-docs", mcp: "webai_gemini_canvas_to_docs", ts: "webAiGeminiCanvasToDocs", fn: webAiGeminiCanvasToDocs },
  { cli: "webai:gemini:generate-video", mcp: "webai_gemini_generate_video", ts: "webAiGeminiGenerateVideo", fn: webAiGeminiGenerateVideo },
  { cli: "webai:task-status", mcp: "webai_task_status", ts: "webAiTaskStatus", fn: webAiTaskStatus }
];

test("consumer contract v1.3.0 webai tools round-trip through CLI, MCP, and TS exports", () => {
  const manifest = contract();
  const cliSource = fs.readFileSync(path.resolve(process.cwd(), "src/cli.ts"), "utf-8");
  const mcpToolNames = new Set(listMcpTools().map((tool) => tool.name));
  for (const item of webAiV13Tools) {
    const row = manifest.commands.find((command: any) => command.cli_name === item.cli);
    assert.ok(row, `missing contract row ${item.cli}`);
    assert.equal(row.mcp_name, item.mcp);
    assert.equal(row.ts_export, item.ts);
    assert.equal(row.maturity, "experimental");
    assert.equal(row.may_contain_sensitive_local_fields, false);
    assert.ok(cliSource.includes(`"${item.cli}"`), `${item.cli} missing from CLI dispatch map`);
    assert.ok(mcpToolNames.has(item.mcp), `${item.mcp} missing from MCP tools`);
    assert.equal(typeof item.fn, "function", `${item.ts} missing TS export`);
    assertNoForbiddenFields(row.output_keys, manifest.forbidden_output_fields);
  }
  assert.equal(manifest.commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_")).length, 13);
});

test("new v1.3.0 error codes exist in TS export and contract manifest", () => {
  const manifest = contract();
  for (const code of ["AUTO_PUBLISH_DETECTED", "ARTIFACT_MODE_UNSUPPORTED", "MODEL_SELECTION_DRIFT", "PLAN_OR_QUOTA_REQUIRED", "SAFE_OUTPUT_REDACTION_REQUIRED", "PROFILE_LEASE_BUSY"]) {
    assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes(code), `TS missing ${code}`);
    assert.ok(manifest.error_codes.includes(code), `contract missing ${code}`);
  }
});

test("webai task status and prompt-deny responses do not leak forbidden fields", async () => {
  const manifest = contract();
  const missing = await callMcpTool("webai_task_status", { task_id: "missing" });
  assertNoForbiddenFields(missing, manifest.forbidden_output_fields);
  assert.deepEqual(missing, { status: "failed", errorCode: "INVALID_ARGS" });
  await assert.rejects(
    () => callMcpTool("webai_gemini_generate_video", { profile: "p", prompt: "please publish this publicly", download_dir: process.cwd() }),
    (error: any) => error.errorCode === "POLICY_APPROVAL_REQUIRED"
  );
});

import { redactValue } from "../src/trace/redact";
import { webAiSendPromptInput, webAiSendPromptOutputShape } from "../src/mcp/schemas";

function mockWebAiRuntime(page: any): any {
  const context = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [context], close: async () => undefined };
  return {
    launcher: {
      launch: async () => ({}),
      connectOverCdp: async () => browser
    }
  };
}

function mockSendPromptPage(initialUrl: string): any {
  const calls: { goto: string[] } = { goto: [] };
  const page: any = {
    _url: initialUrl,
    calls,
    url() { return this._url; },
    goto: async (url: string) => { calls.goto.push(url); page._url = url; },
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    keyboard: { press: async () => undefined, type: async () => undefined },
    locator: (_selector: string) => {
      const loc: any = {
        first: () => loc,
        last: () => loc,
        count: async () => 0,
        waitFor: async () => undefined,
        fill: async () => undefined,
        click: async () => undefined,
        textContent: async () => "assistant response"
      };
      return loc;
    }
  };
  return page;
}

test("LOGIN_REQUIRED returned for send-prompt login URL precheck", async () => {
  const page = mockSendPromptPage("https://claude.ai/login?from=logout");
  let locatorTouched = false;
  page.locator = () => {
    locatorTouched = true;
    throw new Error("prompt locator should not be touched on login page");
  };
  const result: any = await webAiClaudeSendPrompt({ profile: "claude", prompt: "hello" }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.error_code, "LOGIN_REQUIRED");
  assert.equal(result.errorCode, "LOGIN_REQUIRED");
  assert.equal(result.service, "claude");
  assert.equal(locatorTouched, false);
});

test("chat_url is not redacted to placeholder literal", () => {
  const id = "6a04a213-5648-83e8-b9d0-6134aef56831";
  const url = `https://chatgpt.com/c/${id}`;
  const redacted: any = redactValue({ chat_url: url, trace: url }, { mode: "default" });
  assert.equal(redacted.chat_url, url);
  assert.equal(redacted.trace, "https://chatgpt.com/c/<conversation-id>");
});

test("send-prompt wait_ms and completion_detected round-trip through schema and contract", () => {
  const manifest = contract();
  const inputSchema: any = webAiSendPromptInput.toJsonSchema();
  assert.ok(inputSchema.properties.response_timeout_ms, "response_timeout_ms input schema missing");
  assert.ok(inputSchema.properties.reuse_conversation, "reuse_conversation input schema missing");
  assert.ok(webAiSendPromptOutputShape.wait_ms, "wait_ms output shape missing");
  assert.ok(webAiSendPromptOutputShape.completion_detected, "completion_detected output shape missing");
  for (const cli of ["webai:chatgpt:send-prompt", "webai:claude:send-prompt", "webai:gemini:send-prompt"]) {
    const row = manifest.commands.find((command: any) => command.cli_name === cli);
    assert.ok(row.output_keys.always_present.includes("wait_ms"), `${cli} wait_ms missing`);
    assert.ok(row.output_keys.always_present.includes("completion_detected"), `${cli} completion_detected missing`);
  }
  const chatgpt = manifest.commands.find((command: any) => command.cli_name === "webai:chatgpt:send-prompt");
  assert.ok(chatgpt.output_keys.always_present.includes("reuse_conversation"), "chatgpt reuse_conversation missing");
});

test("webai:chatgpt:send-prompt navigates away from stale conversation unless reuse-conversation", async () => {
  const stale = "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831";
  const freshPage = mockSendPromptPage(stale);
  const result: any = await webAiChatgptSendPrompt({ profile: "chatgpt", prompt: "hi", response_timeout_ms: 10 }, mockWebAiRuntime(freshPage));
  assert.equal(freshPage.calls.goto.length, 1);
  assert.match(freshPage.calls.goto[0], /^https:\/\/chatgpt\.com\/\?model=gpt-4o/);
  assert.equal(result.completion_detected, true);
  assert.equal(typeof result.wait_ms, "number");

  const reusePage = mockSendPromptPage(stale);
  await webAiChatgptSendPrompt({ profile: "chatgpt", prompt: "hi", reuse_conversation: true, response_timeout_ms: 10 }, mockWebAiRuntime(reusePage));
  assert.equal(reusePage.calls.goto.length, 0);
});
