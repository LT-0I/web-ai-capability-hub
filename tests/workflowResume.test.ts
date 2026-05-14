const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { WorkflowExecutor, WorkflowResumeError } from "../src/workflows/executor";

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-resume-")); }
function tempDb(): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(tempDir(), "capability.json"), preferSqlite: false }); }
function plan(actions: any[]): any { return { id: "wf", target: "chatgpt", profile: "chatgpt", compiledAt: new Date(0).toISOString(), actions, warnings: [] }; }
function step(stepId: string, type = "wait", idempotent = true): any { return { stepId, action: { type, waitFor: "timeout", timeoutMs: 1, confirmed: true }, requiresApproval: false, idempotent }; }

test("resume skips succeeded idempotent steps and runs the next step after crash", async () => {
  const db = tempDb();
  const runId = "run_resume";
  const p = plan([step("one"), step("two"), step("three")]);
  const firstCalls: string[] = [];
  const executor = new WorkflowExecutor({ database: db, actionExecutor: { execute: async (_action: any) => {
    const id = p.actions[firstCalls.length].stepId;
    firstCalls.push(id);
    if (id === "three") throw Object.assign(new Error("crash"), { errorCode: "CRASH" });
    return { ok: true, action: _action, message: id, data: { artifactId: `art_${id}` } };
  } } as any });
  await assert.rejects(() => executor.runPlan(p, { runId }));
  assert.deepEqual(firstCalls, ["one", "two", "three"]);

  const secondCalls: string[] = [];
  const resumed = await new WorkflowExecutor({ database: db, actionExecutor: { execute: async (action: any) => {
    secondCalls.push("three");
    return { ok: true, action, message: "three", data: { artifactId: "art_three" } };
  } } as any }).resumeRun(runId);
  assert.equal(resumed.ok, true);
  assert.deepEqual(secondCalls, ["three"]);
  assert.deepEqual(resumed.results.map((r) => r.stepId), ["one", "two", "three"]);
});

test("resume refuses prior successful non-idempotent steps without confirmation", async () => {
  const db = tempDb();
  const runId = "run_nonidempotent";
  const p = plan([step("submit", "type", false), step("wait", "wait", true)]);
  await new WorkflowExecutor({ database: db, actionExecutor: { execute: async (action: any) => ({ ok: true, action, message: "ok" }) } as any }).runPlan(p, { runId });
  await assert.rejects(
    () => new WorkflowExecutor({ database: db, actionExecutor: { execute: async (action: any) => ({ ok: true, action, message: "ok" }) } as any }).resumeRun(runId),
    (error: any) => error instanceof WorkflowResumeError && error.errorCode === "RESUME_REQUIRES_CONFIRMATION"
  );
});

test("resume refuses idempotency hash mismatch", async () => {
  const db = tempDb();
  const runId = "run_hash";
  const p = plan([step("one")]);
  db.addWorkflowRun({ id: runId, workflow_id: p.id, target_id: p.target, profile: p.profile, mode: "automatic", status: "running", started_at: new Date(0).toISOString(), plan: p });
  db.addRunEvent({ id: "event_bad", run_id: runId, step_id: "one", event_type: "succeeded", status: "succeeded", timestamp: new Date(0).toISOString(), inputs_hash: "bad", payload: { result: { ok: true } } });
  await assert.rejects(
    () => new WorkflowExecutor({ database: db, actionExecutor: { execute: async (action: any) => ({ ok: true, action, message: "ok" }) } as any }).resumeRun(runId, { confirmReplay: true }),
    (error: any) => error instanceof WorkflowResumeError && error.errorCode === "IDEMPOTENCY_MISMATCH" && error.evidence.stepId === "one"
  );
});
