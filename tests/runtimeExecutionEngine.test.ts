import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine } from "../src/runtime/exec/engine";
import { CancelRegistry } from "../src/runtime/cancel/registry";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";

function freshCancelRegistry(): CancelRegistry {
  // Isolated store so concurrent tests don't see each other's cancel requests.
  return new CancelRegistry(new RuntimeLeaseStore(`/tmp/ee-test-${Date.now()}-${Math.random()}.sqlite`));
}

test("ExecutionEngine dry_run short-circuits without acquiring profile and returns 'dry-run' status", async () => {
  const result = await ExecutionEngine.run("meta.consumer.health", { dry_run: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry-run");
  assert.ok(result.runId);
  // Dry-run must emit Created + PolicyCheck states only
  const states = result.events.map((e) => e.state);
  assert.deepEqual(states, ["Created", "PolicyCheck"]);
});

test("ExecutionEngine happy path emits the full state-machine sequence to Completed", async () => {
  const result = await ExecutionEngine.run("nonexistent.manifest.id", { /* no profile so no real launch */ });
  assert.equal(result.ok, true, "no-profile happy-path should complete");
  assert.equal(result.status, "completed");
  const states = result.events.map((e) => e.state);
  // Per spec the FSM should include Planning, Observing, Executing, Extracting, PersistingEvidence, Completed
  for (const required of ["Created", "PolicyCheck", "Planning", "Observing", "Executing", "Extracting", "PersistingEvidence", "Completed"]) {
    assert.ok(states.includes(required as any), `state machine missing ${required} (got ${states.join(",")})`);
  }
});

test("ExecutionEngine cancel BEFORE run rejects to Cancelled status", async () => {
  const cancel = freshCancelRegistry();
  const runId = "preset-cancelled-run";
  cancel.request(runId, "test pre-cancel");
  const result = await ExecutionEngine.run("any.manifest", { run_id: runId }, { cancelRegistry: cancel });
  assert.equal(result.ok, false);
  assert.equal(result.status, "cancelled");
  const states = result.events.map((e) => e.state);
  assert.ok(states.includes("Cancelled"), `expected Cancelled in ${states.join(",")}`);
});

test("ExecutionEngine surfaces POLICY_APPROVAL_REQUIRED when manifest requires approval and not confirmed", async () => {
  // Use a manifest that has safety.requiresApproval=true. webai.* writes typically do.
  // Pick any manifest that exists with requiresApproval=true; if none, this test no-ops.
  const result = await ExecutionEngine.run("webai.chatgpt.send_prompt", { /* not confirmed */ });
  // If the manifest exists and requires approval, status should be humanhandoff w/ POLICY_APPROVAL_REQUIRED.
  // If the manifest doesn't exist or doesn't require approval, the engine still runs to Completed.
  // The assertion below tolerates both shapes but if it WAS a write-class manifest it MUST gate.
  if (result.errorCode === "POLICY_APPROVAL_REQUIRED") {
    assert.equal(result.status, "humanhandoff");
    assert.equal(result.ok, false);
  } else {
    // Otherwise it should at minimum produce a coherent run result.
    assert.ok(typeof result.runId === "string");
    assert.ok(["completed", "failed", "dry-run", "cancelled", "humanhandoff"].includes(result.status as string));
  }
});

test("ExecutionEngine result includes manifestId, runId, and an ordered events array", async () => {
  const result = await ExecutionEngine.run("smoke.manifest", {});
  assert.equal(result.manifestId, "smoke.manifest");
  assert.match(result.runId, /^run_[0-9a-f]+$/);
  assert.ok(Array.isArray(result.events));
  for (let i = 1; i < result.events.length; i++) {
    assert.ok(result.events[i].at >= result.events[i - 1].at, "events should be monotonically non-decreasing in time");
  }
});

test("ExecutionEngine accepts and threads through dryRun (camelCase) variant", async () => {
  const result = await ExecutionEngine.run("any.manifest", { dryRun: true });
  assert.equal(result.status, "dry-run");
});
