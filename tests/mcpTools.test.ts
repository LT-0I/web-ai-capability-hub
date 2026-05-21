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

test("Gemini video prompt path falls back to the default Gemini composer", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf8");
  const videoPromptBlock = source.slice(source.indexOf('record.progress_label = "submitting video prompt"'), source.indexOf('record.progress_label = "generating video'));
  assert.equal(serviceDefaults.gemini.promptSelector, 'div[role="textbox"][aria-label="Enter a prompt for Gemini"][contenteditable="true"][data-placeholder="Ask Gemini"]');
  assert.match(videoPromptBlock, /sendPromptInExistingPage\("gemini",\s*\{ \.\.\.args, __expectImageResponse: true, __forceEnterToSend: true \}/);
  assert.doesNotMatch(videoPromptBlock, /__promptSelector:\s*GEMINI_IMAGE_PROMPT_SELECTOR/);
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

test("webai_chatgpt_generate_file no longer rejects pptx pre-flight (issue #16 R1 reverts the #12 R2 pptx-rejection after live probe)", async () => {
  // #16 R1: chatgpt-9223 live probe (2026-05-21) confirmed real .pptx generation
  // via the post-revamp file-card UI; the pre-flight INVALID_ARGS guard is now
  // xlsx-only. With pptx the handler proceeds to the browser stage, so the
  // runtime-that-fails-if-browser-invoked path now reaches the launcher (which
  // we deliberately fail) — callMcpTool wraps that into a non-INVALID_ARGS
  // envelope. That envelope shape (browser was invoked AND error is not the
  // pre-flight pptx guard) is the contract we want to assert.
  const browserCalls = { count: 0 };
  const result = await callMcpTool("webai_chatgpt_generate_file", {
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
  const result = await callMcpTool("webai_claude_generate_file", {
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
