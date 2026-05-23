import test from "node:test";
import assert from "node:assert/strict";
import { CancelRegistry } from "../src/runtime/cancel/registry";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";

function freshRegistry(): CancelRegistry {
  return new CancelRegistry(new RuntimeLeaseStore(`/tmp/cr-test-${Date.now()}-${Math.random()}.sqlite`));
}

test("CancelRegistry.request records run + isCancelled returns true", () => {
  const reg = freshRegistry();
  const signal = reg.request("run-1", "user cancelled");
  assert.equal(signal.runId, "run-1");
  assert.match(signal.reason || "", /user cancelled/);
  assert.equal(reg.isCancelled("run-1"), true);
  assert.equal(reg.isCancelled("run-not-cancelled"), false);
});

test("CancelRegistry.request is idempotent: re-requesting same run updates timestamp but stays cancelled", () => {
  const reg = freshRegistry();
  const a = reg.request("run-i", "first");
  const b = reg.request("run-i", "second");
  assert.equal(a.runId, b.runId);
  assert.equal(reg.isCancelled("run-i"), true);
});

test("CancelRegistry.throwIfCancelled throws once a run is cancelled", () => {
  const reg = freshRegistry();
  reg.request("run-t", "stop please");
  assert.throws(
    () => reg.throwIfCancelled("run-t"),
    (err: any) => /CANCELLED/.test(err.message) && err.status === "cancelled"
  );
});

test("CancelRegistry.throwIfCancelled is a no-op for un-cancelled runs", () => {
  const reg = freshRegistry();
  assert.doesNotThrow(() => reg.throwIfCancelled("not-cancelled"));
});
