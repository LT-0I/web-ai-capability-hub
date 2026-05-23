import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";

function freshStore(): RuntimeLeaseStore {
  // Each test gets its own temp DB path so we don't share state. Memory fallback
  // is used unless better-sqlite3 is installed.
  return new RuntimeLeaseStore(`/tmp/ls-test-${Date.now()}-${Math.random()}.sqlite`);
}

test("acquireProfileLease + activeProfileLease round-trip", () => {
  const store = freshStore();
  const lease = store.acquireProfileLease("chatgpt", "run-1", "http://127.0.0.1:9223", 300);
  const active = store.activeProfileLease("chatgpt");
  assert.equal(active?.lease_id, lease.lease_id);
  assert.equal(active?.run_id, "run-1");
  assert.equal(active?.status, "active");
});

test("acquireProfileLease enforces single-owner: 2nd run with different runId throws PROFILE_LEASE_BUSY", () => {
  const store = freshStore();
  store.acquireProfileLease("chatgpt", "runA", "http://127.0.0.1:9223", 300);
  assert.throws(
    () => store.acquireProfileLease("chatgpt", "runB", "http://127.0.0.1:9224", 300),
    (err: any) => err.errorCode === "PROFILE_LEASE_BUSY"
  );
});

test("acquireProfileLease IDEMPOTENT: 2nd acquire by SAME runId returns same lease_id", () => {
  const store = freshStore();
  const first = store.acquireProfileLease("chatgpt", "run-1", "http://127.0.0.1:9223", 300);
  const second = store.acquireProfileLease("chatgpt", "run-1", "http://127.0.0.1:9223", 300);
  assert.equal(first.lease_id, second.lease_id, "same-runId acquire should be idempotent");
});

test("releaseProfileLease marks lease released so a fresh run can acquire", () => {
  const store = freshStore();
  const lease = store.acquireProfileLease("chatgpt", "run-1", "http://127.0.0.1:9223", 300);
  store.releaseProfileLease(lease.lease_id);
  // Now run-2 must succeed
  const next = store.acquireProfileLease("chatgpt", "run-2", "http://127.0.0.1:9224", 300);
  assert.equal(next.run_id, "run-2");
  assert.equal(next.status, "active");
});

test("gcExpiredLeases reaps profile_lease past TTL", () => {
  const store = freshStore();
  const lease = store.acquireProfileLease("ttl-prof", "run-1", "http://127.0.0.1:9223", 1);
  const row = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.lease_id);
  if (row) row.last_heartbeat_at = new Date(Date.now() - 10_000).toISOString();
  const gc = store.gcExpiredLeases();
  assert.ok(gc.profiles >= 1, "expired profile lease should be reaped");
});

test("gcExpiredLeases reaps stale-PID leases (pid not alive)", () => {
  const store = freshStore();
  const lease = store.acquireProfileLease("stale-prof", "run-1", "http://127.0.0.1:9223", 3600);
  const row = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.lease_id);
  if (row) row.pid = 99999999; // absurdly large pid is not alive
  const gc = store.gcExpiredLeases();
  assert.ok(gc.profiles >= 1, "stale-PID lease should be reaped");
});

test("cancel_requests round-trip: requestCancel + cancelRequested", () => {
  const store = freshStore();
  store.requestCancel("run-c", "user clicked cancel");
  const row = store.cancelRequested("run-c");
  assert.equal(row?.run_id, "run-c");
  assert.match(String(row?.reason || ""), /user clicked cancel/);
});

test("drift_events insertDriftEvent persists confidence and componentScores", () => {
  const store = freshStore();
  store.insertDriftEvent({
    run_id: "run-d",
    manifest_id: "test.manifest",
    selector_role: "promptBox",
    resolution_step: 4,
    confidence: 0.42,
    component_scores_json: JSON.stringify({ ariaMatch: 0.5, nearTextJaccard: 0.3 })
  });
  const events = (store as any).memory.drift_events;
  assert.ok(events.length >= 1, "drift event should be stored");
  assert.equal(events[events.length - 1].confidence, 0.42);
});
