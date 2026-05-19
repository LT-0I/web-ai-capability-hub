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
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /^img\[alt\^="Generated image" i\]/);
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /main img\[src\^="blob:"\]/);
  assert.match(CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR, /main img\[alt\*="generated" i\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /^button\[aria-label="Save"\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /button\[aria-label="Download"\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /xpath=.*pointer-events-auto/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /button\[@aria-label="Edit image"\]/);
  assert.match(CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR, /not\(contains\(translate\(@aria-label,'SHARE','share'\),'share'\)\)/);
});

test("Gemini video prompt path falls back to the default Gemini composer", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/mcp/tools.ts"), "utf8");
  const videoPromptBlock = source.slice(source.indexOf('record.progress_label = "submitting video prompt"'), source.indexOf('record.progress_label = "generating video'));
  assert.equal(serviceDefaults.gemini.promptSelector, 'div[role="textbox"][aria-label="Enter a prompt for Gemini"]');
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
      if (selector === "button.toolbox-drawer-button") return new ToolModeLocator(failStage === "drawer" ? 0 : 1);
      if (selector === '[role="menuitemcheckbox"]:has-text("Create video")') return new ToolModeLocator(failStage === "menu" ? 0 : 1);
      return new ToolModeLocator(0);
    },
    waitForSelector: async (selector: string) => {
      if (selector === "button.toolbox-drawer-button" && failStage === "drawer") throw new Error(message);
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
