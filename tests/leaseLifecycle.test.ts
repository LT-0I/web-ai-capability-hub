import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine } from "../src/runtime/exec/engine";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { CancelRegistry } from "../src/runtime/cancel/registry";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }
function page(): any {
  const locator = () => {
    const loc: any = { first: () => loc, count: async () => 1, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
    return loc;
  };
  return { locator, getByRole: () => ({ count: async () => 0 }), title: async () => "", url: () => "about:blank", keyboard: { press: async () => undefined } };
}

test("ExecutionEngine sends heartbeat every 60s during long Executing state", async () => {
  let now = Date.parse("2026-05-23T00:00:00.000Z");
  const heartbeats: number[] = [];
  const store = new RuntimeLeaseStore(tempPath("heartbeat-store"));
  const runtime = {
    now: () => new Date(now),
    sleep: async (ms: number) => { now += ms; },
    page: page(),
    leaseStore: store,
    cancelRegistry: new CancelRegistry(store),
    profilePool: {
      async acquireProfile(_profile: string, runId: string) {
        return {
          leaseId: "lease-heartbeat",
          profileId: "p",
          runId,
          cdpEndpoint: "http://127.0.0.1:9223",
          heartbeat: () => { heartbeats.push(now); },
          renew: () => undefined,
          releaseFn: async () => undefined
        };
      }
    }
  };
  const result = await ExecutionEngine.run("webai.chatgpt.send_prompt", { profile: "p", prompt: "x", simulate_execution_ms: 180_000 }, runtime as any);
  assert.equal(result.status, "completed");
  assert.deepEqual(heartbeats, [
    Date.parse("2026-05-23T00:01:00.000Z"),
    Date.parse("2026-05-23T00:02:00.000Z"),
    Date.parse("2026-05-23T00:03:00.000Z")
  ]);
});

test("PROFILE_LEASE_TIMEOUT surfaces when lease is stuck past 2×TTL with live holder", () => {
  const store = new RuntimeLeaseStore(tempPath("lease-timeout"));
  const lease = store.acquireProfileLease("stuck-profile", "run-old", "http://127.0.0.1:9223", 1, process.pid);
  const row = (store as any).memory.profile_leases.find((item: any) => item.lease_id === lease.lease_id);
  row.last_heartbeat_at = new Date(Date.now() - 3_000).toISOString();
  assert.throws(
    () => store.acquireProfileLease("stuck-profile", "run-new", "http://127.0.0.1:9224", 1, process.pid),
    (error: any) => error.errorCode === "PROFILE_LEASE_TIMEOUT"
  );
  assert.equal(store.listProfileLeases().find((item) => item.lease_id === lease.lease_id)?.status, "expired");
});

test("TAB_LEASE_EXPIRED surfaces when expired tab lease blocks a new acquire", () => {
  const store = new RuntimeLeaseStore(tempPath("tab-expired"));
  const lease = store.acquireTabLease("profile-lease", "https://gemini.google.com/app", 1);
  const row = (store as any).memory.tab_leases.find((item: any) => item.lease_id === lease.lease_id);
  row.last_heartbeat_at = new Date(Date.now() - 2_000).toISOString();
  assert.throws(
    () => store.acquireTabLease("profile-lease", "https://gemini.google.com/app", 1),
    (error: any) => error.errorCode === "TAB_LEASE_EXPIRED"
  );
  assert.equal(store.listTabLeases().find((item) => item.lease_id === lease.lease_id)?.status, "expired");
});
