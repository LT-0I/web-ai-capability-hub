import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { ProfilePool } from "../src/runtime/pool/profilePool";
import type { LauncherImpl } from "../src/runtime/pool/launcherImpl";

function freshStore(): RuntimeLeaseStore {
  return new RuntimeLeaseStore(`/tmp/pp-test-${Date.now()}-${Math.random()}.sqlite`);
}

let launchCalls = 0;
let launchPlan: Array<{ cdpEndpoint: string; closeBehaviour?: () => Promise<void> }> = [];

function createStubLauncher(): LauncherImpl {
  return {
    async launch(opts) {
      const step = launchPlan[launchCalls % Math.max(launchPlan.length, 1)] || { cdpEndpoint: `cdp://stub-${opts.profile}-${launchCalls}` };
      launchCalls++;
      return {
        cdpEndpoint: step.cdpEndpoint,
        pid: process.pid,
        close: step.closeBehaviour || (async () => {})
      };
    }
  };
}

test("ProfilePool acquire happy path returns a lease with releaseFn", async () => {
  launchCalls = 0;
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }];
  const pool = new ProfilePool(freshStore(), createStubLauncher());
  const lease = await pool.acquireProfile("chatgpt", "run-1", { ttlSeconds: 60 });
  assert.equal(lease.profileId, "chatgpt");
  assert.equal(lease.runId, "run-1");
  assert.equal(lease.cdpEndpoint, "http://127.0.0.1:9223");
  assert.equal(typeof lease.releaseFn, "function");
  assert.equal(typeof lease.heartbeat, "function");
  assert.match(lease.leaseId, /^profile_lease_[0-9a-f]+$/);
  await lease.releaseFn();
});

test("ProfilePool acquire rejects empty profileId with INVALID_ARGS", async () => {
  const pool = new ProfilePool(freshStore(), createStubLauncher());
  await assert.rejects(
    () => pool.acquireProfile("", "run-2"),
    (err: any) => err.errorCode === "INVALID_ARGS"
  );
});

test("ProfilePool acquire rejects empty runId with INVALID_ARGS", async () => {
  const pool = new ProfilePool(freshStore(), createStubLauncher());
  await assert.rejects(
    () => pool.acquireProfile("chatgpt", ""),
    (err: any) => err.errorCode === "INVALID_ARGS"
  );
});

test("ProfilePool acquire enforces single-owner: 2nd run on same profile must be PROFILE_LEASE_BUSY", async () => {
  launchCalls = 0;
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }, { cdpEndpoint: "http://127.0.0.1:9224" }];
  const store = freshStore();
  const pool = new ProfilePool(store, createStubLauncher());
  const lease1 = await pool.acquireProfile("chatgpt", "run-A");
  // A SECOND run on the SAME profile (still active) MUST be rejected per spec.
  // CURRENT IMPLEMENTATION SHIPS A BUG: `profilePool.ts` reads `existing` but never
  // throws — only `leaseStore.acquireProfileLease` enforces. Verify the underlying
  // store does enforce. If profilePool wraps but suppresses, this test will FAIL,
  // exposing the bug. We deliberately test the END-TO-END pool acquire because that
  // is the contract surface.
  await assert.rejects(
    () => pool.acquireProfile("chatgpt", "run-B"),
    (err: any) => err.errorCode === "PROFILE_LEASE_BUSY",
    "second concurrent acquire on same profile must throw PROFILE_LEASE_BUSY"
  );
  assert.equal(launchCalls, 1, "busy lease must be rejected before launching another browser");
  await lease1.releaseFn();
});

test("ProfilePool TTL expiry: store.gcExpiredLeases expires past-TTL leases", async () => {
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }];
  const store = freshStore();
  const pool = new ProfilePool(store, createStubLauncher());
  const lease = await pool.acquireProfile("ttl-prof", "run-ttl", { ttlSeconds: 1 });
  // Force expire by mutating the row (memory mode)
  const row = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.leaseId);
  if (row) row.last_heartbeat_at = new Date(Date.now() - 5000).toISOString();
  const gc = store.gcExpiredLeases();
  assert.ok(gc.profiles >= 1, "expected at least one expired profile lease");
  const refetched = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.leaseId);
  if (refetched) assert.equal(refetched.status, "expired");
});

test("ProfilePool stale-PID detection: lease whose pid is not alive is reaped", async () => {
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }];
  const store = freshStore();
  const pool = new ProfilePool(store, createStubLauncher());
  const lease = await pool.acquireProfile("stale-prof", "run-stale", { ttlSeconds: 3600 });
  // Set pid to an impossibly-large value that is not alive.
  const row = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.leaseId);
  if (row) row.pid = 99999999;
  const gc = store.gcExpiredLeases();
  assert.ok(gc.profiles >= 1, "expected stale-PID lease to be reaped");
});

test("ProfilePool releaseFn marks lease released so a NEW run can acquire", async () => {
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }, { cdpEndpoint: "http://127.0.0.1:9224" }];
  const store = freshStore();
  const pool = new ProfilePool(store, createStubLauncher());
  const lease1 = await pool.acquireProfile("rel-prof", "run-x");
  await lease1.releaseFn();
  // After release, a new run on the same profile must succeed
  const lease2 = await pool.acquireProfile("rel-prof", "run-y");
  assert.notEqual(lease2.leaseId, lease1.leaseId, "new lease must have a new id");
  await lease2.releaseFn();
});

test("ProfilePool heartbeat updates last_heartbeat_at for the active lease", async () => {
  launchPlan = [{ cdpEndpoint: "http://127.0.0.1:9223" }];
  const store = freshStore();
  const pool = new ProfilePool(store, createStubLauncher());
  const lease = await pool.acquireProfile("hb-prof", "run-hb");
  const before = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.leaseId)?.last_heartbeat_at;
  await new Promise((r) => setTimeout(r, 5));
  lease.heartbeat();
  const after = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.leaseId)?.last_heartbeat_at;
  assert.ok(before && after && after >= before, "heartbeat should advance last_heartbeat_at");
  await lease.releaseFn();
});
