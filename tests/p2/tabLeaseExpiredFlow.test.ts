import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeLeaseStore } from "../../src/runtime/pool/leaseStore";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }

test("p2 tab lease: auto-expires at TTL via gcExpiredLeases", () => {
  const store = new RuntimeLeaseStore(tempPath("p2-tab-auto-expire"));
  const lease = store.acquireTabLease("profile-x", "https://chat.example/app", 1);
  const row = (store as any).memory.tab_leases.find((r: any) => r.lease_id === lease.lease_id);
  row.last_heartbeat_at = new Date(Date.now() - 5_000).toISOString();
  row.acquired_at = new Date(Date.now() - 5_000).toISOString();
  const gc = store.gcExpiredLeases();
  assert.ok(gc.tabs >= 1, `expected at least one tab to be reaped, got ${gc.tabs}`);
  const after = store.listTabLeases().find((r) => r.lease_id === lease.lease_id);
  assert.equal(after?.status, "expired");
});

test("p2 tab lease: TAB_LEASE_EXPIRED surfaces when expired tab still in registry blocks new acquire", () => {
  const store = new RuntimeLeaseStore(tempPath("p2-tab-expired-blocks"));
  const lease = store.acquireTabLease("profile-y", "https://gemini.example/app", 1);
  const row = (store as any).memory.tab_leases.find((r: any) => r.lease_id === lease.lease_id);
  row.last_heartbeat_at = new Date(Date.now() - 2_500).toISOString();
  row.acquired_at = new Date(Date.now() - 2_500).toISOString();
  assert.throws(
    () => store.acquireTabLease("profile-y", "https://gemini.example/app", 1),
    (err: any) => err.errorCode === "TAB_LEASE_EXPIRED" && /TAB_LEASE_EXPIRED/.test(err.message),
    "expected TAB_LEASE_EXPIRED error code"
  );
  const after = store.listTabLeases().find((r) => r.lease_id === lease.lease_id);
  assert.equal(after?.status, "expired", "old tab lease must be released to 'expired'");
});

test("p2 tab lease: heartbeatTabLease + renewTabLease before expiry extend lease cleanly without throw", () => {
  const store = new RuntimeLeaseStore(tempPath("p2-tab-renew"));
  const lease = store.acquireTabLease("profile-z", "https://claude.example/app", 60);
  const initialHb = (store as any).memory.tab_leases.find((r: any) => r.lease_id === lease.lease_id).last_heartbeat_at;
  // small sleep to ensure timestamps differ in ISO ms precision
  return new Promise<void>((resolve) => setTimeout(() => {
    store.heartbeatTabLease(lease.lease_id);
    store.renewTabLease(lease.lease_id, 30);
    const after = (store as any).memory.tab_leases.find((r: any) => r.lease_id === lease.lease_id);
    assert.ok(after.last_heartbeat_at >= initialHb, "tab lease heartbeat must advance");
    assert.equal(after.ttl_seconds, 90, "renew should extend ttl (60 + 30)");
    assert.equal(after.status, "active", "lease must stay active");
    // re-acquire same key should hand back same active lease, not throw
    const reacquired = store.acquireTabLease("profile-z", "https://claude.example/app", 60);
    assert.equal(reacquired.lease_id, lease.lease_id);
    resolve();
  }, 20));
});
