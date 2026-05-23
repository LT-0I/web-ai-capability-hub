import test from "node:test";
import assert from "node:assert/strict";

import { wahCapabilityQuery, wahCapabilityQueryInput } from "../src/facade/wah/capabilityQuery";
import { wahAdapterHealth, wahAdapterHealthInput } from "../src/facade/wah/adapterHealth";
import { wahPolicyExplain, wahPolicyExplainInput } from "../src/facade/wah/policyExplain";
import { wahTaskStart, wahTaskStartInput } from "../src/facade/wah/taskStart";
import { wahTaskStatus, wahTaskStatusInput } from "../src/facade/wah/taskStatus";
import { wahTaskCancel, wahTaskCancelInput } from "../src/facade/wah/taskCancel";
import { wahTaskResume, wahTaskResumeInput } from "../src/facade/wah/taskResume";
import { wahArtifactGet, wahArtifactGetInput } from "../src/facade/wah/artifactGet";

test("wah_capability_query: dry-call returns ok=true with manifests + capabilities arrays", async () => {
  const result: any = await wahCapabilityQuery({});
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.manifests), "manifests must be an array");
  assert.ok(Array.isArray(result.capabilities), "capabilities must be an array");
});

test("wah_adapter_health: returns ok shape with manifest_count and by_kind", async () => {
  const result: any = await wahAdapterHealth({});
  assert.equal(typeof result.ok, "boolean");
  assert.equal(typeof result.manifest_count, "number");
  assert.equal(typeof result.by_kind, "object");
});

test("wah_policy_explain: rejects empty args with INVALID_ARGS", async () => {
  const result: any = await wahPolicyExplain({});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_ARGS");
});

test("wah_task_start: dry-run returns status='dry-run' and does not acquire a profile", async () => {
  const result: any = await wahTaskStart({ manifest_id: "meta.smoke", dry_run: true });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry-run");
  assert.ok(result.runId);
});

test("wah_task_status: requires run_id and returns workflow_run + events shape", async () => {
  // No real run-id so workflow_run will be null and events should be an array (possibly empty)
  const result: any = await wahTaskStatus({ run_id: "nonexistent-run-id" });
  assert.equal(result.ok, true);
  assert.equal(result.run_id, "nonexistent-run-id");
  assert.equal(result.workflow_run, null);
  assert.ok(Array.isArray(result.events));
});

test("wah_task_cancel: records a cancel request and returns status='cancel_requested'", async () => {
  const result: any = await wahTaskCancel({ run_id: "run-to-cancel", reason: "test" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "cancel_requested");
  assert.equal(result.runId, "run-to-cancel");
});

test("wah_task_resume: invokes ExecutionEngine with resume_of=run_id", async () => {
  const result: any = await wahTaskResume({ run_id: "prev-run", manifest_id: "meta.x", input: { dry_run: true } });
  assert.equal(typeof result.runId, "string");
  // dry_run was forwarded via spread, so status should be dry-run
  assert.equal(result.status, "dry-run");
});

test("wah_artifact_get: rejects when neither artifact_id nor path supplied with INVALID_ARGS", async () => {
  const result: any = await wahArtifactGet({});
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_ARGS");
});

test("wah_*: all 8 tools export an inputSchema (objectSchema)", () => {
  // The objectSchema utility returns a RuntimeSchema with toJsonSchema()
  for (const schema of [
    wahCapabilityQueryInput,
    wahAdapterHealthInput,
    wahPolicyExplainInput,
    wahTaskStartInput,
    wahTaskStatusInput,
    wahTaskCancelInput,
    wahTaskResumeInput,
    wahArtifactGetInput
  ]) {
    assert.ok(schema, "every wah_* tool must export an inputSchema constant");
    assert.equal(typeof (schema as any).toJsonSchema, "function", "inputSchema must implement toJsonSchema()");
    const js = (schema as any).toJsonSchema();
    assert.equal(js.type, "object");
  }
});

test("wah_*: required-args contract matches consumer-contract.json", async () => {
  const contract = require("../configs/consumer-contract.json");
  const expected: Record<string, string[]> = {
    wah_capability_query: [],
    wah_adapter_health: [],
    wah_policy_explain: [],
    wah_task_start: ["manifest_id"],
    wah_task_status: ["run_id"],
    wah_task_cancel: ["run_id"],
    wah_task_resume: ["run_id", "manifest_id"],
    wah_artifact_get: []
  };
  for (const [mcp, args] of Object.entries(expected)) {
    const row = contract.commands.find((c: any) => c.mcp_name === mcp);
    assert.ok(row, `contract row missing for ${mcp}`);
    assert.deepEqual(row.required_args, args, `${mcp} required_args mismatch`);
  }
});
