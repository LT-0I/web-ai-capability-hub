const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
import { activateGeminiToolMode, callMcpTool, CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, listMcpTools, loginRequiredForService, serviceDefaults, WebAiToolError } from "../src/mcp/tools";
import { browserOpenInput, workflowExecuteInput } from "../src/mcp/schemas";

test("claude login detection is anchored to auth path segments", () => {
  for (const url of [
    "https://claude.ai/new?x=login",
    "https://claude.ai/chat/abc",
    "https://claude.ai/recents",
    "https://claude.ai/new",
    "https://claude.ai/?returnTo=/login",
    "https://claude.ai/chat/signup-not-auth",
    "https://claude.ai/project/logout-summary"
  ]) {
    assert.equal(loginRequiredForService("claude", url), false, url);
  }
  for (const url of ["https://claude.ai/login", "https://claude.ai/signup", "https://claude.ai/logout", "https://claude.ai/login/"]) {
    assert.equal(loginRequiredForService("claude", url), true, url);
  }
});

test("ChatGPT image selectors use generated-image fallbacks and share-excluding download fallback", () => {
  const oldSaveOnly = '[data-testid="fullscreen-shell-header"] button[aria-label="Save"], [role="dialog"] button[aria-label="Save"]';
  assert.notEqual(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, oldSaveOnly);
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /\[role="button"\]\[aria-labelledby\]/);
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /imagegen-image|\[id\^="image-"\]/);
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /img\[alt\^="Generated image" i\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /^xpath=/);
  assert.doesNotMatch(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /,\s*xpath=/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /@aria-label="Save"/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /@aria-label="Download"/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /pointer-events-auto/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /button\[@aria-label="Edit image"\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /not\(contains\(translate\(@aria-label,"SHARE","share"\),"share"\)\)/);
});

test("Gemini video prompt path pins to the Describe-your-video composer (issue #16 R2)", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf8");
  const videoPromptBlock = source.slice(source.indexOf('record.progress_label = "submitting video prompt"'), source.indexOf('record.progress_label = "generating video'));
  // Default composer is still "Ask Gemini" — that selector is unchanged.
  assert.equal(serviceDefaults.gemini.promptSelector, 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]');
  // #16 R2: when Videos mode is active the composer's data-placeholder is
  // "Describe your video" — falling back to the default composer matched
  // count=0 and timed out at 15s (root cause locked via probe-video-all-tabs.mjs
  // 2026-05-21). The video send call must pin __promptSelector to the
  // video-mode composer (same shape as image generation pinning to
  // GEMINI_IMAGE_PROMPT_SELECTOR).
  assert.match(videoPromptBlock, /sendPromptInExistingPage\("gemini",\s*\{ \.\.\.args, __expectImageResponse: true, __forceEnterToSend: true, __promptSelector: GEMINI_VIDEO_PROMPT_SELECTOR \}/);
  // Image and video have distinct composer pinning constants.
  assert.doesNotMatch(videoPromptBlock, /__promptSelector:\s*GEMINI_IMAGE_PROMPT_SELECTOR/);
  // The new constant exists and discriminates by data-placeholder="Describe your video".
  assert.match(source, /const GEMINI_VIDEO_PROMPT_SELECTOR = .*data-placeholder="Describe your video"/);
});

class ToolModeLocator {
  constructor(private countValue: number) {}
  first(): ToolModeLocator { return this; }
  async count(): Promise<number> { return this.countValue; }
  async getAttribute(): Promise<string> { return ""; }
  async isDisabled(): Promise<boolean> { return false; }
  async elementHandles(): Promise<any[]> { return []; }
  async click(): Promise<void> {}
}

function toolModePage(failStage: "drawer" | "menu" | "active", message: string): any {
  const activeSelector = 'button[aria-label="Deselect Create video"]';
  return {
    waitForTimeout: async () => undefined,
    context: () => ({ newCDPSession: async () => ({ send: async () => undefined, detach: async () => undefined }) }),
    locator: (selector: string) => {
      if (selector === activeSelector) return new ToolModeLocator(0);
      if (selector === 'button[aria-label="Upload & tools"]') return new ToolModeLocator(failStage === "drawer" ? 0 : 1);
      if (selector === '[role="menuitemcheckbox"]:has-text("Create video")') return new ToolModeLocator(failStage === "menu" ? 0 : 1);
      return new ToolModeLocator(0);
    },
    waitForSelector: async (selector: string) => {
      if (selector === 'button[aria-label="Upload & tools"]' && failStage === "drawer") throw new Error(message);
      if (selector === '[role="menuitemcheckbox"]:has-text("Create video")' && failStage === "menu") throw new Error(message);
      if (selector === activeSelector && failStage === "active") throw new Error(message);
      return {};
    }
  };
}

test("activateGeminiToolMode evidence carries drawer/menu/active sub-cause", async () => {
  const cases = [
    ["drawer", "drawer hydration timeout"],
    ["menu", "menu item hydration timeout"],
    ["active", "active pill hydration timeout"]
  ] as const;
  for (const [stage, message] of cases) {
    await assert.rejects(
      () => activateGeminiToolMode(toolModePage(stage, message), {
        menuItemSelector: '[role="menuitemcheckbox"]:has-text("Create video")',
        activeSelector: 'button[aria-label="Deselect Create video"]',
        toolName: "Create video"
      }),
      (error: any) => {
        assert.ok(error instanceof WebAiToolError);
        assert.equal(error.errorCode, "ELEMENT_NOT_FOUND");
        assert.match(String(error.evidence?.cause), new RegExp(message));
        return true;
      }
    );
  }
});

test("MCP tool definitions include required browser tools and validate schemas", () => {
  const names = listMcpTools().map((tool) => tool.name);
  for (const expected of ["browser_start", "browser_open", "browser_read", "browser_click", "browser_run_recipe", "browser_capture_site_map", "workflow_execute"]) {
    assert.ok(names.includes(expected), `${expected} missing`);
  }
  assert.equal(browserOpenInput.safeParse({ url: "https://example.test" }).success, true);
  assert.equal(browserOpenInput.safeParse({}).success, false);
});

function runtimeThatFailsIfBrowserInvoked(counter: { count: number }): any {
  return {
    launcher: {
      launch: async () => { counter.count++; throw new Error("browser launch should not be invoked"); },
      connectOverCdp: async () => { counter.count++; throw new Error("browser CDP should not be invoked"); }
    }
  };
}

test("heavy-generation tools widen the MCP invocation deadline so 3-5min model latency does not race the artifactClick budget (issue #16 R2)", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf8");
  // Lock the per-tool override map shape: webai_chatgpt_generate_file gets
  // 900000ms (15 min) because consumer cycle#26 (smoke 09, 2026-05-21) observed
  // the file-card streaming in at 6-9 min into the run on Thinking-class paths;
  // image generators stay at 600000ms (10 min) and every other tool retains the
  // 180s default. Hard ceiling MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS is widened to
  // 900000 to admit the chatgpt_generate_file override.
  assert.match(source, /MCP_TOOL_INVOCATION_TIMEOUT_OVERRIDES_MS:\s*Record<string,\s*number>\s*=\s*\{[\s\S]+?webai_chatgpt_generate_file:\s*900000,[\s\S]+?webai_chatgpt_generate_image:\s*600000,[\s\S]+?webai_gemini_generate_image:\s*600000[\s\S]+?\}/);
  // webai_gemini_generate_video is async (Veo, minutes) — like
  // chatgpt_generate_file it receives 900000ms (15 min) so the 180s default
  // does not race the gemini_media_rpc video DOM poll and emit a misleading
  // COMMAND_TIMEOUT before the MP4 can be captured (live smoke 2026-05-29).
  assert.match(source, /MCP_TOOL_INVOCATION_TIMEOUT_OVERRIDES_MS:\s*Record<string,\s*number>\s*=\s*\{[\s\S]+?webai_gemini_generate_video:\s*900000[\s\S]*?\}/);
  assert.match(source, /const MAX_MCP_TOOL_INVOCATION_TIMEOUT_MS\s*=\s*900000;/);
  // withMcpToolDeadline + mcpToolInvocationTimeoutMs accept the tool name so
  // the per-tool override actually engages.
  assert.match(source, /async function withMcpToolDeadline<T>\(tool: string, run: \(\) => Promise<T>\): Promise<T> \{\s*const timeoutMs = mcpToolInvocationTimeoutMs\(tool\);/);
  // Env override remains the ceiling (no per-tool override beats env).
  assert.match(source, /MCP_TOOL_TIMEOUT_ENV_KEYS = \["WEBAI_MCP_TOOL_TIMEOUT_MS", "MCP_TOOL_TIMEOUT_MS"\]/);
});

test("webai_chatgpt_generate_file no longer rejects pptx pre-flight (issue #16 R1 reverts the #12 R2 pptx-rejection after live probe)", async () => {
  // #16 R1: chatgpt-9223 live probe (2026-05-21) confirmed real .pptx generation
  // via the post-revamp file-card UI; the pre-flight INVALID_ARGS guard is now
  // xlsx-only. With pptx the handler proceeds to the browser stage, so the
  // runtime-that-fails-if-browser-invoked path now reaches the launcher (which
  // we deliberately fail) — callMcpTool wraps that into a non-INVALID_ARGS
  // envelope. That envelope shape (browser was invoked AND error is not the
  // pre-flight pptx guard) is the contract we want to assert.
  const browserCalls = { count: 0 };
  const result = await callMcpTool("webai_chatgpt_generate_file", { backend: "managed-cdp",
    profile: "chatgpt-generate-file-pptx-no-longer-rejected",
    prompt: "Create a three-slide deck",
    expected_extension: "pptx",
    download_dir: process.cwd()
  }, runtimeThatFailsIfBrowserInvoked(browserCalls)) as any;

  assert.equal(result.ok, false);
  assert.ok(browserCalls.count > 0, "pptx now reaches the browser stage instead of pre-flight rejection");
  // The envelope must NOT be the old pre-flight pptx rejection.
  assert.doesNotMatch(String(result.error ?? ""), /expected_extension="pptx" is not supported/);
});

test("webai_claude_generate_file rejects xlsx pre-flight without browser or artifact metadata", async () => {
  const browserCalls = { count: 0 };
  const result = await callMcpTool("webai_claude_generate_file", { backend: "managed-cdp",
    profile: "claude-generate-file-xlsx-guard",
    prompt: "Create a spreadsheet",
    artifact_class: "document",
    expected_extension: "xlsx",
    download_dir: process.cwd()
  }, runtimeThatFailsIfBrowserInvoked(browserCalls)) as any;

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_ARGS");
  assert.equal(result.error_code, "INVALID_ARGS");
  assert.match(result.error, /expected_extension="xlsx" is not supported on webai_claude_generate_file/);
  assert.match(result.error, /Supported: docx, pptx \(and code\/text artifacts: py, md, csv, svg, html, mmd, pdf\)\./);
  assert.equal("path" in result, false);
  assert.equal("sha256" in result, false);
  assert.equal("size_bytes" in result, false);
  assert.equal(browserCalls.count, 0);
});

test("workflow_execute accepts an inline workflow and returns a dry-run plan without a file path", async () => {
  const workflow = {
    id: "inline-final-text",
    target: "gemini",
    steps: [{ id: "read", action: "read" }],
    result: { type: "text" }
  };

  assert.equal(workflowExecuteInput.safeParse({ workflow }).success, true);

  const response = await callMcpTool("workflow_execute", { workflow }) as any;

  assert.equal(response.ok, true);
  assert.equal(response.status, "dry-run");
  assert.equal(response.plan.id, "inline-final-text");
  assert.equal(response.plan.result.type, "text");
  assert.equal(response.plan.actions.at(-1).stepId, "final-text");
  assert.equal(response.plan.actions.at(-1).action.type, "extract");
  assert.equal(response.plan.actions.at(-1).action.extract, "text");
  assert.equal(response.finalResult, undefined);
  assert.equal(response.stepResults, undefined);
});

test("workflow_execute skips approval gates for non-manual approval workflow modes", async () => {
  let launchCount = 0;
  const fakePage = {
    url: () => "https://example.test",
    waitForLoadState: async () => undefined
  };
  const fakeLauncher = {
    launch: async () => {
      launchCount++;
      return {};
    },
    connectOverCdp: async () => ({
      contexts: () => [{ pages: () => [fakePage] }],
      close: async () => undefined
    })
  };
  const plan = {
    id: "automatic-approval-opt-out",
    target: "custom",
    mode: "automatic",
    compiledAt: "2026-05-06T00:00:00.000Z",
    warnings: [],
    actions: [{
      stepId: "submit",
      requiresApproval: true,
      reason: "Submitting requires approval.",
      action: { type: "click", target: { role: "button", name: "Submit" }, dryRun: true }
    }]
  };

  const response = await callMcpTool("workflow_execute", { plan, dryRun: false }, { launcher: fakeLauncher as any }) as any;

  assert.equal(response.ok, true);
  assert.equal(response.status, "completed");
  assert.equal(response.plan.id, plan.id);
  assert.equal(response.stepResults[0].ok, true);
  assert.equal(launchCount, 1);
});
