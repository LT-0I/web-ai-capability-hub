import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine } from "../../src/runtime/exec/engine";
import { RuntimeLeaseStore } from "../../src/runtime/pool/leaseStore";
import { CancelRegistry } from "../../src/runtime/cancel/registry";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }

function page(): any {
  const locator = () => {
    const loc: any = { first: () => loc, count: async () => 1, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
    return loc;
  };
  return { locator, getByRole: () => ({ count: async () => 0 }), title: async () => "", url: () => "about:blank", keyboard: { press: async () => undefined } };
}

test("p2 heartbeat: last_heartbeat_at advances monotonically across multiple heartbeats", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-hb-mono"));
  const lease = store.acquireProfileLease("p-mono", "run-mono", "http://127.0.0.1:9223", 60, process.pid);
  const initial = lease.last_heartbeat_at;
  await new Promise((resolve) => setTimeout(resolve, 15));
  store.heartbeatProfileLease(lease.lease_id);
  const after1 = store.listProfileLeases().find((row) => row.lease_id === lease.lease_id)?.last_heartbeat_at;
  await new Promise((resolve) => setTimeout(resolve, 15));
  store.heartbeatProfileLease(lease.lease_id);
  const after2 = store.listProfileLeases().find((row) => row.lease_id === lease.lease_id)?.last_heartbeat_at;
  assert.ok(after1 && after1 >= initial, `first heartbeat must advance (initial=${initial}, after1=${after1})`);
  assert.ok(after2 && after2 >= after1, `second heartbeat must advance (after1=${after1}, after2=${after2})`);
});

test("p2 heartbeat: lease past wall-clock TTL but with recent heartbeat is NOT reaped (because expired() uses last_heartbeat_at anchor)", () => {
  const store = new RuntimeLeaseStore(tempPath("p2-hb-recent"));
  const lease = store.acquireProfileLease("p-recent", "run-recent", "http://127.0.0.1:9223", 1, process.pid);
  // wait past TTL wall-clock
  const wait = 1500;
  return new Promise<void>((resolve) => setTimeout(() => {
    store.heartbeatProfileLease(lease.lease_id);
    const gc = store.gcExpiredLeases();
    assert.equal(gc.profiles, 0, `recent heartbeat should keep lease alive across GC; got profiles reaped=${gc.profiles}`);
    const row = store.listProfileLeases().find((r) => r.lease_id === lease.lease_id);
    assert.equal(row?.status, "active");
    resolve();
  }, wait));
});

test("p2 heartbeat: lease with stale heartbeat past 2×TTL and live PID surfaces PROFILE_LEASE_TIMEOUT on reacquire", () => {
  const store = new RuntimeLeaseStore(tempPath("p2-hb-stale"));
  const lease = store.acquireProfileLease("p-stale", "run-stale", "http://127.0.0.1:9223", 1, process.pid);
  const row = (store as any).memory.profile_leases.find((r: any) => r.lease_id === lease.lease_id);
  // backdate heartbeat to >2x TTL ago
  row.last_heartbeat_at = new Date(Date.now() - 5_000).toISOString();
  assert.throws(
    () => store.acquireProfileLease("p-stale", "run-stale-new", "http://127.0.0.1:9224", 1, process.pid),
    (err: any) => err.errorCode === "PROFILE_LEASE_TIMEOUT" && /PROFILE_LEASE_TIMEOUT/.test(err.message),
    "expected PROFILE_LEASE_TIMEOUT when stale lease + live holder"
  );
  const expired = store.listProfileLeases().find((r) => r.lease_id === lease.lease_id);
  assert.equal(expired?.status, "expired", "stale-and-live lease must be force-released to 'expired'");
});

test("p2 heartbeat: ExecutionEngine emits lease.renew event when execution duration approaches TTL", async () => {
  let now = Date.parse("2026-05-23T00:00:00.000Z");
  const store = new RuntimeLeaseStore(tempPath("p2-hb-renew"));
  const renewed: number[] = [];
  const runtime = {
    now: () => new Date(now),
    sleep: async (ms: number) => { now += ms; },
    page: page(),
    leaseStore: store,
    cancelRegistry: new CancelRegistry(store),
    heartbeatIntervalMs: 60_000,
    leaseRenewBeforeMs: 30_000,
    profilePool: {
      async acquireProfile(_profile: string, runId: string) {
        return {
          leaseId: "lease-renew",
          profileId: "p",
          runId,
          cdpEndpoint: "http://127.0.0.1:9223",
          heartbeat: () => undefined,
          renew: (ttl?: number) => { renewed.push(ttl || 0); },
          releaseFn: async () => undefined
        };
      }
    }
  };
  // TTL = 5min default, simulate ~5min execution so renewBeforeMs window triggers renew
  const result = await ExecutionEngine.run("webai.chatgpt.send_prompt", { profile: "p", prompt: "x", simulate_execution_ms: 290_000, confirmed: true }, runtime as any);
  assert.equal(result.status, "completed");
  assert.ok(renewed.length >= 1, `expected at least one lease.renew call, got ${renewed.length}`);
  const renewEvents = result.runEvents.filter((e: any) => e.kind === "lease.renew");
  assert.ok(renewEvents.length >= 1, `expected at least one 'lease.renew' RunEvent, got ${renewEvents.length}`);
});
