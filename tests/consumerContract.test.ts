const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { consumerHealth, ConsumerHealthResult } from "../src/consumer/health";
import { CONSUMER_ERROR_CODES } from "../src/consumer/errorCodes";
import { ManagedBrowserLauncher, ManagedBrowserStatus } from "../src/browser/managedLauncher";
import { main } from "../src/cli";
import { CapabilityDatabase } from "../src/capabilities/database";
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

function tempCapabilityDb(): CapabilityDatabase {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "wah-task-db-"));
  return new CapabilityDatabase({ dbPath: path.join(dir, "capability.json"), preferSqlite: false });
}

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
    // Gemini responseText() scopes to the latest <model-response> via
    // page.evaluate (NOT locator("main")). Default mock returns the clean
    // scoped answer; tests that need to assert scoping override this.
    evaluate: async () => "scoped gemini answer",
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

function installCompletionDom(options: { stopVisible?: boolean; sendDisabled?: boolean; assistantTexts?: string[]; renderedImage?: boolean; regenerateVisible?: boolean } = {}): void {
  const visibleBox = [{ width: 1 }];
  const stop = { offsetWidth: options.stopVisible ? 1 : 0, offsetHeight: 0, getClientRects: () => options.stopVisible ? visibleBox : [] };
  const send = { offsetWidth: 1, offsetHeight: 0, disabled: Boolean(options.sendDisabled), getClientRects: () => visibleBox, getAttribute: (name: string) => name === "aria-disabled" ? String(Boolean(options.sendDisabled)) : null };
  const regenerate = { offsetWidth: options.regenerateVisible ? 1 : 0, offsetHeight: 0, getClientRects: () => options.regenerateVisible ? visibleBox : [], getAttribute: (name: string) => name === "aria-label" ? "Redo" : null };
  const assistants = (options.assistantTexts || []).map((text) => ({ offsetWidth: 1, offsetHeight: 0, getClientRects: () => visibleBox, textContent: text }));
  const main = { textContent: (options.assistantTexts || []).join("\n") };
  const image = { naturalWidth: options.renderedImage ? 64 : 0, naturalHeight: options.renderedImage ? 64 : 0 };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).document = {
    querySelectorAll: (selector: string) => {
      if (selector.includes("Stop response") || selector.includes("stop-button") || selector.includes("Stop")) return options.stopVisible ? [stop] : [];
      if (selector.includes("Send message")) return [send];
      if (selector.includes("regenerate-button")) return options.regenerateVisible ? [regenerate] : [];
      if (selector.includes("role=\"article\"") || selector.includes("article") || selector.includes("turn") || selector.includes("response") || selector.includes("assistant")) return assistants;
      if (selector.includes("AI generated") || selector.includes("img")) return [image];
      return [];
    },
    querySelector: (selector: string) => selector === "main" ? main : selector.includes("Send message") ? send : null
  };
}

function cleanupCompletionDom(): void {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
}

test("waitForPromptCompletion phase A times out when generation never starts", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  let waitCalls = 0;
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => {
    waitCalls++;
    assert.equal(options.timeout, 25);
    throw new Error("phase a timeout");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "should not be read" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ profile: "gemini-9225", prompt: "hello", response_timeout_ms: 25 }, mockWebAiRuntime(page));
  assert.equal(waitCalls, 1, "Phase B must not run when generation never starts");
  assert.equal(result.completion_detected, false);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.response_text, "");
});

test("waitForPromptCompletion returns true only after Phase A start then Phase B completion and stable content", async () => {
  const phases: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (fn: any, arg: any) => {
    try {
      if (arg.assistantCountBefore !== undefined) {
        phases.push("phase-a");
        installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: [] });
        assert.equal(fn(arg), false);
        installCompletionDom({ stopVisible: true, sendDisabled: true, assistantTexts: [] });
        assert.equal(fn(arg), true);
        assert.match(arg.turnSelector, /article|turn|response/);
        assert.equal(arg.assistantSelector, undefined);
        return;
      }
      phases.push("phase-b");
      installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["final answer"], regenerateVisible: true });
      assert.equal(fn(arg), false);
      assert.match(arg.regenerateSelector, /regenerate-button/);
      (globalThis as any).window.__webAiCompletionStable.since -= 1600;
      assert.equal(fn(arg), true);
    } finally {
      cleanupCompletionDom();
    }
  };
  // Gemini responseText() reads the latest <model-response> via page.evaluate
  // (scoped clean answer), NOT locator("main") (chrome-polluted).
  page.evaluate = async () => "final answer";
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "MAIN should not be the response source" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ profile: "gemini-9225", prompt: "hello", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.deepEqual(phases, ["phase-a", "phase-b"]);
  assert.equal(result.completion_detected, true);
  assert.equal(result.response_text, "final answer");
});

test("gemini send.prompt completion polling uses extractor-visible Stop response/Send message/regenerate selectors", async () => {
  const seen: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (_fn: any, arg: any) => { seen.push(JSON.stringify(arg)); };
  // The whole <main> is polluted with nav chrome + cross-conversation titles.
  // response_text MUST NOT be sourced from it (CLAUDE.md anti-pattern).
  const POLLUTED_MAIN = "Gemini New chat My stuff Notebooks Gems Chats Other Convo Title You said q Gemini said the clean answer is 42.";
  page.evaluate = async () => "the clean answer is 42.";
  page.locator = (selector: string) => {
    seen.push(selector);
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? POLLUTED_MAIN : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ profile: "gemini-9225", prompt: "hello", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.completion_detected, true);
  // Scoped to the latest model-response answer body — NOT the chrome-polluted <main>.
  assert.equal(result.response_text, "the clean answer is 42.");
  assert.equal(result.response_text.includes("New chat"), false);
  assert.equal(result.response_text.includes("My stuff"), false);
  assert.equal(result.response_text.includes("Other Convo Title"), false);
  assert.notEqual(result.response_text, POLLUTED_MAIN);
  assert.match(seen.join("\n"), /button\[aria-label="Stop response"\]/);
  assert.match(seen.join("\n"), /button\[aria-label="Send message"\]/);
  assert.match(seen.join("\n"), /regenerate-button/);
  assert.match(seen.join("\n"), /assistantCountBefore/);
});

test("gemini responseText scopes to latest model-response, not the chrome-polluted main", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  const fn = source.slice(source.indexOf("async function responseText("), source.indexOf("async function composerText("));
  // Gemini branch must use page.evaluate scoped to model-response, never
  // locator("main")/assistantMessageSelector for the returned text.
  assert.match(fn, /service === "gemini"/);
  assert.match(fn, /GEMINI_LATEST_RESPONSE_SELECTOR/);
  assert.match(fn, /GEMINI_RESPONSE_TEXT_INNER_SELECTORS/);
  assert.match(fn, /page\.evaluate/);
  const geminiBranch = fn.slice(0, fn.indexOf("return await page.locator"));
  assert.equal(/assistantMessageSelector\(service\)/.test(geminiBranch), false);
  // The model-response inner targets are the live-observed clean answer nodes.
  const constLine = source.match(/const GEMINI_RESPONSE_TEXT_INNER_SELECTORS = .*;/)?.[0] || "";
  assert.match(constLine, /model-response-text/);
  assert.match(constLine, /message-content/);
  assert.match(constLine, /markdown/);
});

test("gemini upload-and-query intercepts filechooser before clicking upload-files item", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const calls: string[] = [];
  const setFilesCalls: string[][] = [];
  const chooser = { setFiles: async (files: string[]) => { calls.push("chooser.setFiles"); setFilesCalls.push(files); } };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.setInputFiles = async (selector: string) => { calls.push(`setInputFiles:${selector}`); };
  page.waitForEvent = async (event: string, options: any) => { calls.push(`waitForEvent:${event}:${options?.timeout}`); return chooser; };
  page.waitForSelector = async (selector: string) => { calls.push(`waitForSelector:${selector}`); };
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => { calls.push(`waitForFunction:${options?.timeout}`); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Open upload file menu") || selector.includes("local-images-files-uploader-button") || selector.includes("Send message") ? 1 : 0,
      waitFor: async () => { calls.push(`waitFor:${selector}`); },
      fill: async () => { calls.push(`fill:${selector}`); },
      click: async () => { calls.push(`click:${selector}`); },
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ profile: "gemini-9225", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.deepEqual(setFilesCalls, [[path.resolve(file)]]);
  assert.equal(calls.some((c) => c === 'waitForSelector:input[type="file"]'), false, calls.join("\n"));
  assert.equal(calls.some((c) => c === 'setInputFiles:input[type="file"]'), false, calls.join("\n"));
  const menuWaitIndex = calls.findIndex((c) => c.startsWith('waitForSelector:button[data-test-id="local-images-files-uploader-button"]'));
  const chooserWaitIndex = calls.findIndex((c) => c === "waitForEvent:filechooser:15000");
  const menuClickIndex = calls.findIndex((c) => c.startsWith('click:button[data-test-id="local-images-files-uploader-button"]'));
  const setFilesIndex = calls.findIndex((c) => c === "chooser.setFiles");
  assert.ok(menuWaitIndex >= 0, calls.join("\n"));
  assert.ok(chooserWaitIndex > menuWaitIndex, calls.join("\n"));
  assert.ok(menuClickIndex > chooserWaitIndex, calls.join("\n"));
  assert.ok(setFilesIndex > menuClickIndex, calls.join("\n"));
  assert.ok(menuClickIndex > menuWaitIndex, calls.join("\n"));
  assert.ok(calls.find((c) => c === "waitForFunction:15000"), calls.join("\n"));
  assert.ok(calls.findIndex((c) => c === "waitForFunction:15000") < calls.findIndex((c) => c === 'click:button[aria-label="Send message"]'), calls.join("\n"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query completion gate recognizes post-upload response container", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-complete-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const phases: string[] = [];
  const chooser = { setFiles: async () => undefined };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => chooser;
  page.waitForSelector = async () => undefined;
  page.waitForTimeout = async () => undefined;
  page.waitForFunction = async (fn: any, arg: any, options: any) => {
    if (options?.timeout === 15000) {
      phases.push("upload-ready");
      return;
    }
    try {
      if (arg.assistantCountBefore !== undefined) {
        phases.push("phase-a");
        installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["uploaded answer"] });
        assert.equal(fn(arg), true);
        assert.match(arg.turnSelector, /article|turn|response/);
        assert.equal(arg.assistantSelector, undefined);
        return;
      }
      phases.push("phase-b");
      installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["uploaded answer"], regenerateVisible: true });
      assert.equal(fn(arg), false);
      assert.match(arg.regenerateSelector, /regenerate-button/);
      (globalThis as any).window.__webAiCompletionStable.since -= 1600;
      assert.equal(fn(arg), true);
    } finally {
      cleanupCompletionDom();
    }
  };
  // responseText() reads the scoped latest <model-response> via page.evaluate,
  // not locator("main") (which is chrome-polluted on real Gemini).
  page.evaluate = async () => "uploaded answer";
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Open upload file menu") || selector.includes("local-images-files-uploader-button") || selector.includes("Remove file") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      inputValue: async () => "",
      textContent: async () => selector === "main" ? "MAIN should not be the response source" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ profile: "gemini-upload-complete", files: [file], prompt: "read it", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, null);
  assert.equal(result.completion_detected, true);
  assert.equal(result.response_text, "uploaded answer");
  assert.deepEqual(phases, ["upload-ready", "phase-a", "phase-b"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query returns COMMAND_TIMEOUT when post-upload response never renders", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-no-response-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const chooser = { setFiles: async () => undefined };
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => chooser;
  page.waitForSelector = async () => undefined;
  page.waitForFunction = async (_fn: any, _arg: any, options: any) => {
    if (options?.timeout === 15000) return;
    throw new Error("post-upload response never rendered");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Open upload file menu") || selector.includes("local-images-files-uploader-button") || selector.includes("Remove file") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      inputValue: async () => "",
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ profile: "gemini-upload-no-response", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini completion returns COMMAND_TIMEOUT when Phase-B regenerate anchor never appears", async () => {
  const seen: any[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForFunction = async (fn: any, arg: any) => {
    seen.push(arg);
    if (arg.assistantCountBefore !== undefined) {
      installCompletionDom({ stopVisible: true, sendDisabled: true, assistantTexts: [] });
      assert.equal(fn(arg), true);
      cleanupCompletionDom();
      return;
    }
    installCompletionDom({ stopVisible: false, sendDisabled: false, assistantTexts: ["done"], regenerateVisible: false });
    assert.equal(fn(arg), false);
    cleanupCompletionDom();
    throw new Error("regenerate never appeared");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "done" : "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiSendPrompt({ profile: "gemini-regenerate-timeout", prompt: "hello", response_timeout_ms: 100 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.match(JSON.stringify(seen), /regenerate-button/);
});

test("tools.ts Gemini completion path does not rely on stale Angular response selectors", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  const nonGeminiBranchStart = source.indexOf('  try {\n    // Phase A / generation-started gate');
  const geminiBranch = source.slice(source.indexOf('if (service === \"gemini\")'), nonGeminiBranchStart);
  assert.match(geminiBranch, /GEMINI_REGENERATE_BUTTON_SELECTOR/);
  assert.equal(/model-response|message-content|data-response-id/.test(geminiBranch), false);
  assert.equal(/model-response|message-content|data-response-id/.test(source.match(/const GEMINI_RESPONSE_SELECTOR = .*;/)?.[0] || ""), false);
});

test("gemini upload-and-query returns COMMAND_TIMEOUT when filechooser never opens", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-timeout-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async (event: string) => {
    assert.equal(event, "filechooser");
    throw new Error("Timed out waiting for filechooser");
  };
  page.waitForSelector = async () => undefined;
  page.setInputFiles = async () => { throw new Error("stale setInputFiles path should not run"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Open upload file menu") || selector.includes("local-images-files-uploader-button") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ profile: "gemini-upload-timeout", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.selector, 'button[data-test-id="local-images-files-uploader-button"]');
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini upload-and-query returns ELEMENT_NOT_FOUND when upload-files item is absent", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "gemini-upload-missing-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let waitForEventTouched = false;
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForEvent = async () => { waitForEventTouched = true; };
  page.waitForSelector = async (selector: string) => {
    if (selector === 'button[data-test-id="local-images-files-uploader-button"]') throw new Error("not visible");
  };
  page.setInputFiles = async () => { throw new Error("stale setInputFiles path should not run"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Open upload file menu") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "uploaded response"
    };
    return loc;
  };
  const result: any = await webAiGeminiUploadAndQuery({ profile: "gemini-upload-missing", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.error_code, "ELEMENT_NOT_FOUND");
  assert.equal(result.selector, 'button[data-test-id="local-images-files-uploader-button"]');
  assert.equal(waitForEventTouched, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gemini generate-image forces fresh composer navigation before activating image mode", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale123?hl=en");
  const clicks: string[] = [];
  const waits: string[] = [];
  page.waitForSelector = async (selector: string, options: any) => { waits.push(`${selector}:${options?.state}:${options?.timeout}`); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Create image" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { clicks.push(selector); if (selector.includes("New chat")) page._url = "https://gemini.google.com/app?hl=en"; },
      textContent: async () => "image response"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => ({ path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }) } as any;
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-9225", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app?hl=en"]);
  assert.ok(waits.some((entry) => entry === 'button[aria-label*="Create image"]:visible:4000'), waits.join("\n"));
  assert.equal(clicks.some((selector) => selector.includes("New chat")), false, clicks.join("\n"));
});

test("gemini generate-image returns ELEMENT_NOT_FOUND when Create image button wait expires", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale-image?hl=en");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector === 'button[aria-label*="Create image"]') {
      assert.deepEqual(options, { state: "visible", timeout: 4000 });
      throw new Error("create image button did not render");
    }
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("rich-textarea") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-image-button-missing", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.match(result.expected_selector, /button\[aria-label\*=\"Create image\"\].*toolbox-drawer-button.*menuitemcheckbox/);
  assert.deepEqual(page.calls.goto, ["https://gemini.google.com/app?hl=en"]);
});

test("upload-and-query completion fields round-trip through schema and contract", () => {
  const manifest = contract();
  const { webAiUploadAndQueryInput } = require("../src/mcp/schemas");
  const inputSchema: any = webAiUploadAndQueryInput.toJsonSchema();
  assert.ok(inputSchema.properties.response_timeout_ms, "upload_and_query response_timeout_ms input schema missing");
  for (const cli of ["webai:chatgpt:upload-and-query", "webai:claude:upload-and-query", "webai:gemini:upload-and-query"]) {
    const row = manifest.commands.find((command: any) => command.cli_name === cli);
    assert.ok(row.output_keys.always_present.includes("wait_ms"), `${cli} wait_ms missing`);
    assert.ok(row.output_keys.always_present.includes("completion_detected"), `${cli} completion_detected missing`);
  }
});

test("chatgpt upload-and-query reads response before managed page closes", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chatgpt-upload-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let closed = false;
  let responseReadWhileOpen = false;
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.setInputFiles = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("assistant") || selector.includes("main") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => {
        assert.equal(closed, false, "responseText must be read before browser close");
        responseReadWhileOpen = true;
        return "real assistant answer";
      }
    };
    return loc;
  };
  const context = { pages: () => [page], newPage: async () => page };
  const browser = { contexts: () => [context], close: async () => { closed = true; } };
  const runtime = { launcher: { launch: async () => ({}), connectOverCdp: async () => browser } } as any;
  const result: any = await webAiChatgptUploadAndQuery({ profile: "chatgpt-upload-open", files: [file], prompt: "read it", response_timeout_ms: 10 }, runtime);
  assert.equal(result.response_text, "real assistant answer");
  assert.equal(result.completion_detected, true);
  assert.equal(typeof result.wait_ms, "number");
  assert.equal(responseReadWhileOpen, true);
  assert.equal(closed, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("upload-and-query timeout returns COMMAND_TIMEOUT with empty response text", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "claude-upload-timeout-"));
  const file = path.join(dir, "fixture.txt");
  fs.writeFileSync(file, "hello\n");
  const page = mockSendPromptPage("https://claude.ai/new");
  page.setInputFiles = async () => undefined;
  page.waitForFunction = async () => { throw new Error("timeout"); };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => 1,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector.includes("assistant") || selector.includes("main") ? "garbled homepage DOM" : "Claude"
    };
    return loc;
  };
  const result: any = await webAiClaudeUploadAndQuery({ profile: "claude-upload-timeout", files: [file], prompt: "read it", response_timeout_ms: 1 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("generate-file passes captured conversation URL to artifactClickRunner", async () => {
  const calls: any[] = [];
  const page = mockSendPromptPage("https://claude.ai/chat/conversation-123");
  const runtime = {
    ...mockWebAiRuntime(page),
    artifactClick: async (options: any) => {
      calls.push(options);
      return { path: path.join(process.cwd(), "artifact.md"), sha256: "abc", size: 12, downloadFilename: "artifact.md", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 };
    }
  } as any;
  const result: any = await webAiClaudeGenerateFile({ profile: "claude-generate-file", prompt: "make md", expected_extension: "md", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.artifact_name, "artifact.md");
  assert.equal(calls[0].tabUrlContains, "https://claude.ai/chat/conversation-123");
  assert.notEqual(calls[0].tabUrlContains, "https://claude.ai");
});

test("gemini generate-image uses more-menu-button then image-download-button chain", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app/stale456?hl=en");
  page.waitForSelector = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Create image" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("New chat")) page._url = "https://gemini.google.com/app/conversation-456?hl=en"; },
      textContent: async () => selector === "main" ? "image response" : "Fast"
    };
    return loc;
  };
  const calls: any[] = [];
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async (options: any) => { calls.push(options); return { path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }; } } as any;
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-image-chain", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.equal(calls[0].buttonSelector, 'button[data-test-id="more-menu-button"]');
  assert.equal(calls[0].followUpSelector, 'button[data-test-id="image-download-button"]');
});


test("generateImageOnPage waits for image toolbar before artifact-click", async () => {
  const events: string[] = [];
  const page = mockSendPromptPage("https://gemini.google.com/app/stale789?hl=en");
  page.waitForSelector = async (selector: string) => {
    if (selector.includes("more-menu-button")) events.push("render-toolbar");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("New chat") || selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Create image" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("New chat")) page._url = "https://gemini.google.com/app/conversation-789?hl=en"; },
      textContent: async () => selector === "main" ? "image ready" : "Fast"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => { events.push("artifact-click"); return { path: path.join(process.cwd(), "out.png"), sha256: "abc", size: 123, downloadFilename: "out.png" }; } } as any;
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-image-render-order", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "out.png");
  assert.deepEqual(events, ["render-toolbar", "artifact-click"]);
});

test("generateImageOnPage returns COMMAND_TIMEOUT when generated image never renders", async () => {
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForSelector = async (selector: string) => {
    if (selector.includes("more-menu-button")) throw new Error("image toolbar never rendered");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Create image") || selector.includes("Send message") || selector.includes("rich-textarea") ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? "Deselect Create image" : "",
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => selector === "main" ? "image pending" : "Fast"
    };
    return loc;
  };
  let artifactClicked = false;
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => { artifactClicked = true; throw new Error("must not click artifact"); } } as any;
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-image-render-timeout", prompt: "make image", download_dir: process.cwd(), timeout_ms: 50, response_timeout_ms: 10 }, runtime);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.download_filename, "");
  assert.equal(artifactClicked, false);
});



test("chatgpt generate-image enters image mode before typing prompt", async () => {
  const events: string[] = [];
  const page = mockSendPromptPage("https://chatgpt.com/c/stale");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes('menuitemradio')) events.push(`waitForSelector:${selector}:${options?.state}:${options?.timeout}`);
    if (selector.includes("Image, click to remove")) events.push(`waitForSelector:image-mode-active:${options?.state}:${options?.timeout}`);
    if (selector.includes("Edit image")) events.push(`render:${selector}`);
  };
  page.waitForTimeout = async () => undefined;
  page.keyboard = { press: async (key: string) => { events.push(`press:${key}`); }, type: async () => undefined };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("composer-plus-btn") || selector.includes("menuitemradio") || selector.includes("prompt-textarea") ? 1 : 0,
      getAttribute: async () => "",
      waitFor: async () => { events.push(`wait:${selector}`); },
      fill: async () => { events.push(`fill:${selector}`); },
      click: async (options: any) => { events.push(`click:${selector}:${options?.timeout}`); },
      textContent: async () => selector.includes("prompt-textarea") ? "" : "image response"
    };
    return loc;
  };
  const calls: any[] = [];
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async (options: any) => { calls.push(options); return { path: path.join(process.cwd(), "cg.png"), sha256: "abc", size: 123, downloadFilename: "cg.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }; } } as any;
  const result: any = await webAiChatgptGenerateImage({ profile: "chatgpt-image-mode", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "cg.png");
  const plus = events.findIndex((e) => e === "click:#composer-plus-btn:5000");
  const waitRadio = events.findIndex((e) => e === 'waitForSelector:[role="menuitemradio"]:has-text("Create image"):visible:8000');
  const radio = events.findIndex((e) => e === 'click:[role="menuitemradio"]:has-text("Create image"):8000');
  const waitActive = events.findIndex((e) => e === 'waitForSelector:image-mode-active:visible:8000');
  const fill = events.findIndex((e) => e === "fill:#prompt-textarea");
  assert.ok(plus >= 0 && plus < waitRadio && waitRadio < radio && radio < waitActive && waitActive < fill, events.join("\n"));
  assert.ok(events.includes("press:Enter"), events.join("\n"));
  // Live-verified 2026-05-15 (Extended Pro account): the inline image-hover
  // toolbar has NO download button. The real download path is: click the
  // generated image -> a full-screen [role="dialog"] (z-[120] absolute
  // inset-0) opens whose toolbar has a direct button[aria-label="Save"].
  // Two-step CDP artifact-click: open viewer (image) then click Save.
  assert.equal(calls[0].buttonSelector, 'img[alt^="Generated image" i]');
  assert.equal(calls[0].followUpSelector, '[role="dialog"] button[aria-label="Save"]');
});

test("chatgpt generate-image returns ELEMENT_NOT_FOUND when Create image radio wait expires", async () => {
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.waitForSelector = async (selector: string, options: any) => {
    assert.equal(selector, '[role="menuitemradio"]:has-text("Create image")');
    assert.deepEqual(options, { state: "visible", timeout: 8000 });
    throw new Error("radio did not render");
  };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("composer-plus-btn") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiChatgptGenerateImage({ profile: "chatgpt-image-radio-missing", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.expected_selector, '[role="menuitemradio"]:has-text("Create image")');
});

test("chatgpt generate-image returns ELEMENT_NOT_FOUND when image mode does not activate after selecting Create image", async () => {
  const clicks: any[] = [];
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes("menuitemradio")) {
      assert.deepEqual(options, { state: "visible", timeout: 8000 });
      return;
    }
    if (selector.includes("Image, click to remove")) {
      // Radix removed the radio on selection but the composer image-mode pill
      // never appears -> activation genuinely failed.
      assert.deepEqual(options, { state: "visible", timeout: 8000 });
      throw new Error("image mode pill did not render");
    }
  };
  page.waitForTimeout = async () => undefined;
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("composer-plus-btn") || selector.includes("menuitemradio") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async (options: any) => { clicks.push({ selector, timeout: options?.timeout }); },
      getAttribute: async () => "",
      textContent: async () => ""
    };
    return loc;
  };
  const result: any = await webAiChatgptGenerateImage({ profile: "chatgpt-image-mode-no-activate", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.expected_selector, 'button[aria-label="Image, click to remove"], button[aria-label*="image aspect ratio" i]');
  // The radio is clicked exactly once (no detached-element retry loop).
  assert.deepEqual(clicks.filter((entry) => entry.selector === '[role="menuitemradio"]:has-text("Create image")').map((entry) => entry.timeout), [8000]);
});

test("gemini generate-image activates Create image and sends from ql-editor with Enter", async () => {
  const events: string[] = [];
  let label = "🖼️ Create image, button, tap to use tool";
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.waitForSelector = async (selector: string, options: any) => {
    if (selector.includes("Create image")) events.push(`waitForSelector:${selector}:${options?.state}:${options?.timeout}`);
    if (selector.includes("more-menu-button")) events.push(`render:${selector}`);
  };
  page.waitForTimeout = async () => undefined;
  page.keyboard = { press: async (key: string) => { events.push(`press:${key}`); }, type: async () => undefined };
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Create image") || selector.includes("rich-textarea") || selector === "main" ? 1 : 0,
      getAttribute: async (name: string) => name === "aria-label" && selector.includes("Create image") ? label : "",
      waitFor: async () => { events.push(`wait:${selector}`); },
      fill: async () => { events.push(`fill:${selector}`); },
      click: async () => { events.push(`click:${selector}`); if (selector.includes("Create image")) label = "Deselect Create image"; },
      textContent: async () => selector.includes("rich-textarea") ? "" : "image response"
    };
    return loc;
  };
  const runtime = { ...mockWebAiRuntime(page), artifactClick: async () => ({ path: path.join(process.cwd(), "gm.png"), sha256: "abc", size: 123, downloadFilename: "gm.png", downloadGuid: "g", bbox: { x: 0, y: 0, width: 1, height: 1 }, elapsedMs: 1 }) } as any;
  const result: any = await webAiGeminiGenerateImage({ profile: "gemini-image-enter", prompt: "make image", download_dir: process.cwd(), response_timeout_ms: 10 }, runtime);
  assert.equal(result.download_filename, "gm.png");
  const waitCreate = events.findIndex((e) => e === 'waitForSelector:button[aria-label*="Create image"]:visible:4000');
  const create = events.findIndex((e) => e.includes('click:button[aria-label*="Create image"]'));
  const fill = events.findIndex((e) => e === 'fill:rich-textarea .ql-editor[contenteditable="true"]');
  const enter = events.findIndex((e) => e === "press:Enter");
  const render = events.findIndex((e) => e.includes("render:button[data-test-id=\"more-menu-button\"]"));
  assert.ok(waitCreate >= 0 && waitCreate < create && create < fill && fill < enter && enter < render, events.join("\n"));
});

test("tools.ts does not retain stale image/upload selectors", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf-8");
  // The old speculative xpath-ancestor download hack must be gone; the live-
  // verified path is: open the generated image -> [role="dialog"] viewer ->
  // its direct button[aria-label="Save"] (confirmed live 2026-05-15).
  assert.equal(source.includes('xpath=ancestor::*[contains(concat'), false);
  assert.equal(source.includes('CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR'), true);
  assert.equal(source.includes('[role="dialog"] button[aria-label="Save"]'), true);
  assert.equal(source.includes(':has-text("Upload files")'), false);
  assert.equal(source.includes('main img[alt], main img[src^="blob:"], main img[src*="oaiusercontent"], main img'), false);
  assert.equal(source.includes('local-images-files-uploader-button'), true);
});

test("upload-and-query retries uncleared composer once then returns COMMAND_TIMEOUT", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chatgpt-upload-send-confirm-"));
  const file = path.join(dir, "fixture.csv");
  fs.writeFileSync(file, "a,b\n1,2\n");
  let sendClicks = 0;
  const page = mockSendPromptPage("https://chatgpt.com/");
  page.setInputFiles = async () => undefined;
  page.locator = (selector: string) => {
    const isPrompt = selector.includes("ProseMirror") || selector.includes("textarea") || selector.includes("prompt-textarea");
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("send-button") || selector.includes("Send") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => { if (selector.includes("send-button") || selector.includes("Send")) sendClicks++; },
      inputValue: async () => isPrompt ? "read it" : "",
      textContent: async () => isPrompt ? "read it" : "GPT"
    };
    return loc;
  };
  const result: any = await webAiChatgptUploadAndQuery({ profile: "chatgpt-upload-send-confirm", files: [file], prompt: "read it", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(sendClicks, 2);
  assert.equal(result.errorCode, "COMMAND_TIMEOUT");
  assert.equal(result.error_code, "COMMAND_TIMEOUT");
  assert.equal(result.completion_detected, false);
  assert.equal(result.response_text, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canvas-to-docs honest-fails (ELEMENT_NOT_FOUND) when Canvas mode cannot activate", async () => {
  // No Canvas affordance present (Tools drawer + Canvas menuitem absent) -> the
  // tool must surface a stable contract error, never a fake/chrome docs_url.
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      textContent: async () => "Fast"
    };
    return loc;
  };
  const result: any = await webAiGeminiCanvasToDocs({ profile: "gemini-canvas-verify", prompt: "make canvas", title: "gd-canvas-smoke", response_timeout_ms: 10 }, mockWebAiRuntime(page));
  assert.equal(result.docs_url, null);
  assert.equal(result.docs_doc_id, null);
  assert.equal(result.errorCode, "ELEMENT_NOT_FOUND");
  assert.equal(result.error_code, "ELEMENT_NOT_FOUND");
});

test("canvas-to-docs returns a real docs.google.com URL + doc id from the spawned Docs tab", async () => {
  // Drives the live-observed flow: Canvas mode active -> prompt completes ->
  // share/export -> Export to Docs spawns a docs.google.com/document/d/<id>
  // page in the same browser context.
  const docId = "1cMiO8CxtyqiIu4QjayRhc7E-Y9qRsDEZcbxBS_13inY";
  const docsPage: any = { _closed: false, url: () => `https://docs.google.com/document/d/${docId}/edit?tab=t.0`, close: async () => { docsPage._closed = true; } };
  const ctxPages: any[] = [];
  const page: any = {
    _url: "https://gemini.google.com/app?hl=en",
    url() { return this._url; },
    goto: async () => undefined,
    waitForLoadState: async () => undefined,
    waitForFunction: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => { if (!ctxPages.includes(docsPage)) ctxPages.push(docsPage); },
    evaluate: async () => "Canvas note ready",
    context: () => ({ pages: () => ctxPages }),
    keyboard: { press: async () => undefined, type: async () => undefined },
    locator: (selector: string) => {
      // Canvas active pill present so activateGeminiToolMode short-circuits to
      // "already active"; Send present so submit confirms; share/export
      // controls present so the export click path proceeds.
      const present = selector.includes("Deselect Canvas")
        || selector.includes("Send message")
        || selector.includes("share-button")
        || selector.includes("export-to-docs-button");
      const loc: any = {
        first: () => loc,
        last: () => loc,
        count: async () => present ? 1 : 0,
        waitFor: async () => undefined,
        fill: async () => undefined,
        click: async () => undefined,
        getAttribute: async () => null,
        textContent: async () => "Fast"
      };
      return loc;
    }
  };
  const result: any = await webAiGeminiCanvasToDocs({ profile: "gemini-canvas-ok", prompt: "make canvas", title: "ProbeDoc", response_timeout_ms: 10, timeout_ms: 3000 }, mockWebAiRuntime(page));
  assert.equal(result.docs_url, `https://docs.google.com/document/d/${docId}/edit`);
  assert.equal(result.docs_doc_id, docId);
  assert.equal(result.title, "ProbeDoc");
  assert.equal(result.errorCode, null);
  assert.equal(docsPage._closed, true);
});

test("gemini generate-video returns an async task envelope and persists a running task row", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vid-"));
  const db = tempCapabilityDb();
  const page = mockSendPromptPage("https://gemini.google.com/app?hl=en");
  page.locator = (selector: string) => {
    const loc: any = {
      first: () => loc,
      last: () => loc,
      count: async () => selector.includes("Send message") ? 1 : 0,
      waitFor: async () => undefined,
      fill: async () => undefined,
      click: async () => undefined,
      getAttribute: async () => null,
      textContent: async () => "Fast"
    };
    return loc;
  };
  let spawnedTaskId = "";
  const env: any = await webAiGeminiGenerateVideo(
    { profile: "gemini-video-async", prompt: "a 2-second clip of a rotating blue cube", download_dir: dir },
    { ...mockWebAiRuntime(page), database: db, spawnVideoWorker: (taskId: string) => { spawnedTaskId = taskId; return { pid: process.pid }; } } as any
  );
  assert.equal(typeof env.task_id, "string");
  assert.ok(env.task_id.startsWith("task_"));
  assert.equal(env.status, "running");
  assert.equal(env.profile, "gemini-video-async");
  assert.equal(typeof env.lease_id, "string");
  assert.equal(typeof env.started_at, "string");
  assert.equal(spawnedTaskId, env.task_id);
  const persisted = db.getWebAiTask(env.task_id);
  assert.equal(persisted?.status, "running");
  assert.equal(persisted?.profile, "gemini-video-async");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("webai task status reads durable task rows through a fresh database handle", async () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_cross_process",
    status: "done",
    profile: "gemini-cross-process",
    lease_id: "lease_cross",
    started_at: new Date().toISOString(),
    progress_label: "video generated and downloaded",
    result: { path: "/tmp/video.mp4", sha256: "abc", size_bytes: 12, download_filename: "video.mp4" }
  });
  const fresh = new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false });
  const status: any = await webAiTaskStatus({ task_id: "task_cross_process" }, { database: fresh });
  assert.equal(status.status, "done");
  assert.equal(status.progress_label, "video generated and downloaded");
  assert.deepEqual(status.result, { path: "/tmp/video.mp4", sha256: "abc", size_bytes: 12, download_filename: "video.mp4" });
  assert.equal(status.errorCode, undefined);
  assert.deepEqual(await webAiTaskStatus({ task_id: "missing" }, { database: fresh }), { status: "failed", errorCode: "INVALID_ARGS" });
});

test("gemini generate-video detached-worker contract reflects worker terminal result from a fresh store", async () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vid-done-"));
  const artifactPath = path.join(dir, "done.mp4");
  fs.writeFileSync(artifactPath, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"), Buffer.alloc(32)]));
  const db = tempCapabilityDb();
  const runtime = {
    ...mockWebAiRuntime(mockSendPromptPage("https://gemini.google.com/app?hl=en")),
    database: db,
    spawnVideoWorker: (taskId: string, _args: any, database: CapabilityDatabase) => {
      const row = database.getWebAiTask(taskId)!;
      database.upsertWebAiTask({
        ...row,
        status: "done",
        progress_label: "video generated and downloaded",
        result: { path: artifactPath, sha256: "sha", size_bytes: fs.statSync(artifactPath).size, download_filename: "done.mp4" },
        worker_pid: process.pid
      });
      return { pid: process.pid };
    }
  } as any;
  const env: any = await webAiGeminiGenerateVideo({ profile: "gemini-video-detached", prompt: "make video", download_dir: dir }, runtime);
  assert.deepEqual(Object.keys(env), ["task_id", "status", "profile", "lease_id", "started_at"]);
  const fresh = new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false });
  const status: any = await webAiTaskStatus({ task_id: env.task_id }, { database: fresh });
  assert.equal(status.status, "done");
  assert.equal(status.result.path, artifactPath);
  assert.equal(status.result.size_bytes > 0, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("webai task status marks abandoned stale running video task as COMMAND_TIMEOUT", async () => {
  const db = tempCapabilityDb();
  db.upsertWebAiTask({
    task_id: "task_stale",
    status: "running",
    profile: "gemini-stale",
    lease_id: "lease_stale",
    started_at: new Date(Date.now() - 10_000).toISOString(),
    progress_label: "generating video",
    timeout_ms: 1,
    worker_pid: 99999999
  });
  const status: any = await webAiTaskStatus({ task_id: "task_stale" }, { database: new CapabilityDatabase({ dbPath: db.dbPath, preferSqlite: false }) });
  assert.equal(status.status, "failed");
  assert.equal(status.errorCode, "COMMAND_TIMEOUT");
  const persisted = db.getWebAiTask("task_stale");
  assert.equal(persisted?.status, "failed");
  assert.equal(persisted?.errorCode, "COMMAND_TIMEOUT");
});
