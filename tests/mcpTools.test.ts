const test = require("node:test");
const assert = require("node:assert/strict");
import { callMcpTool, listMcpTools, loginRequiredForService } from "../src/mcp/tools";
import { browserOpenInput, workflowExecuteInput } from "../src/mcp/schemas";

test("claude login detection is anchored to auth path segments", () => {
  for (const url of ["https://claude.ai/new?x=login", "https://claude.ai/chat/abc", "https://claude.ai/recents"]) {
    assert.equal(loginRequiredForService("claude", url), false, url);
  }
  for (const url of ["https://claude.ai/login", "https://claude.ai/logout", "https://claude.ai/login/"]) {
    assert.equal(loginRequiredForService("claude", url), true, url);
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
