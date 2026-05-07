const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { WorkflowCompiler } from "../src/workflows/compiler";
import { WorkflowExecutor } from "../src/workflows/executor";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-test-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.sqlite"), preferSqlite: false }); }

test("workflow compiler copies result spec and appends final screenshot/text actions", () => {
  const compiler = new WorkflowCompiler(tempDb());

  const screenshotPlan = compiler.compile({
    id: "capture-final",
    target: "gemini",
    steps: [{ id: "read", action: "read" }],
    result: { type: "screenshot" }
  } as any);

  assert.equal(screenshotPlan.result?.type, "screenshot");
  assert.equal(screenshotPlan.actions.at(-1)?.stepId, "final-screenshot");
  assert.equal(screenshotPlan.actions.at(-1)?.action.type, "screenshot");
  assert.equal(screenshotPlan.actions.at(-1)?.action.confirmed, true);

  const textPlan = compiler.compile({
    id: "extract-final",
    target: "gemini",
    steps: [{ id: "read", action: "read" }],
    result: { type: "text" }
  } as any);

  assert.equal(textPlan.result?.type, "text");
  assert.equal(textPlan.actions.at(-1)?.stepId, "final-text");
  assert.equal(textPlan.actions.at(-1)?.action.type, "extract");
  assert.equal(textPlan.actions.at(-1)?.action.extract, "text");
});

test("workflow executor computes screenshot and text finalResult from action results", async () => {
  const screenshotPath = path.join("data", "screenshots", "final.png");
  const executor = new WorkflowExecutor({
    database: tempDb(),
    actionExecutor: {
      execute: async (action: any) => ({
        ok: true,
        action,
        message: "Captured screenshot",
        screenshotPath
      })
    } as any
  });

  const screenshotResult = await executor.runPlan({
    id: "capture-final",
    target: "gemini",
    compiledAt: new Date(0).toISOString(),
    actions: [{
      stepId: "final-screenshot",
      action: { type: "screenshot", confirmed: true } as any,
      requiresApproval: false
    }],
    warnings: [],
    result: { type: "screenshot" }
  } as any, { dryRun: false });

  assert.deepEqual(screenshotResult.finalResult, {
    kind: "screenshot",
    path: screenshotPath,
    sourceStepId: "final-screenshot"
  });

  const textExecutor = new WorkflowExecutor({
    database: tempDb(),
    actionExecutor: {
      execute: async (action: any) => ({
        ok: true,
        action,
        message: "Extracted text",
        data: "Visible answer"
      })
    } as any
  });

  const textResult = await textExecutor.runPlan({
    id: "extract-final",
    target: "gemini",
    compiledAt: new Date(0).toISOString(),
    actions: [{
      stepId: "final-text",
      action: { type: "extract", extract: "text", confirmed: true },
      requiresApproval: false
    }],
    warnings: [],
    result: { type: "text" }
  } as any, { dryRun: false });

  assert.deepEqual(textResult.finalResult, {
    kind: "text",
    text: "Visible answer",
    sourceStepId: "final-text"
  });
});
