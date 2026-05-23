import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine } from "../../src/runtime/exec/engine";
import { RuntimeLeaseStore } from "../../src/runtime/pool/leaseStore";
import { CancelRegistry } from "../../src/runtime/cancel/registry";
import { CapabilityDatabase } from "../../src/capabilities/database";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }
function tempJson(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.json`; }

function page(): any {
  const locator = () => {
    const loc: any = { first: () => loc, count: async () => 1, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
    return loc;
  };
  return { locator, getByRole: () => ({ count: async () => 0 }), title: async () => "", url: () => "about:blank", keyboard: { press: async () => undefined } };
}

test("p2 cancel: cancel during Observing phase produces Cancelled state, no error code, lease released as 'cancelled'", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-cancel-observe"));
  const cancelRegistry = new CancelRegistry(store);
  const database = new CapabilityDatabase({ dbPath: tempJson("p2-cancel-observe-db"), preferSqlite: false });
  const released: string[] = [];
  const runId = "p2-cancel-observe";
  const runtime = {
    database,
    cancelRegistry,
    leaseStore: store,
    page: page(),
    profilePool: {
      async acquireProfile(_profile: string, run_id: string) {
        return {
          leaseId: `lease-${run_id}`,
          heartbeat: () => undefined,
          renew: () => undefined,
          releaseFn: async (status = "released") => { released.push(status); }
        };
      }
    },
    onRunEvent: async (event: any) => {
      // Cancel as soon as Observing state begins
      if (event.kind === "lifecycle.observing") {
        cancelRegistry.request(runId, "p2 observe-phase cancel");
      }
    }
  };
  const start = Date.now();
  const result = await ExecutionEngine.run("webai.chatgpt.send_prompt", { run_id: runId, profile: "p", prompt: "x", confirmed: true }, runtime as any);
  const elapsed = Date.now() - start;
  assert.equal(result.ok, false, "cancelled run must report ok=false");
  assert.equal(result.status, "cancelled", "status must be 'cancelled'");
  assert.equal(result.errorCode, undefined, "cancel is deliberate state, NOT an error code");
  assert.ok(result.events.some((e: any) => e.state === "Cancelled"), "lifecycle must include Cancelled state");
  assert.deepEqual(released, ["cancelled"], "lease releaseFn must be called with 'cancelled' status");
  assert.ok(elapsed < 5_000, `cancel should land in under 5s, took ${elapsed}ms`);
});

test("p2 cancel: cancel propagates to TabLease.releaseFn with cancelled status", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-cancel-tab"));
  const cancelRegistry = new CancelRegistry(store);
  const database = new CapabilityDatabase({ dbPath: tempJson("p2-cancel-tab-db"), preferSqlite: false });
  const releaseStatuses: string[] = [];
  const runId = "p2-cancel-tab";
  // pre-request cancellation so it fires immediately on first checkCancel
  cancelRegistry.request(runId, "pre-issued cancel");
  const runtime = {
    database,
    cancelRegistry,
    leaseStore: store,
    page: page(),
    profilePool: {
      async acquireProfile(_profile: string, run_id: string) {
        return {
          leaseId: `lease-${run_id}`,
          heartbeat: () => undefined,
          renew: () => undefined,
          releaseFn: async (status = "released") => { releaseStatuses.push(status); }
        };
      }
    }
  };
  const result = await ExecutionEngine.run("webai.gemini.generate_video", { run_id: runId, profile: "gemini-veo", prompt: "video", confirmed: true }, runtime as any);
  assert.equal(result.status, "cancelled");
  assert.equal(releaseStatuses.length, 1);
  assert.equal(releaseStatuses[0], "cancelled");
});

test("p2 cancel: cancel of non-existent run_id is an idempotent no-op (does NOT throw)", async () => {
  const store = new RuntimeLeaseStore(tempPath("p2-cancel-noop"));
  const cancelRegistry = new CancelRegistry(store);
  // request cancel for run that hasn't even been created
  assert.doesNotThrow(() => cancelRegistry.request("nonexistent-run-id", "test"));
  // calling it twice is also idempotent
  assert.doesNotThrow(() => cancelRegistry.request("nonexistent-run-id", "test-again"));
  // isCancelled reports true
  assert.equal(cancelRegistry.isCancelled("nonexistent-run-id"), true);
  // a fresh run with that id should land in Cancelled state immediately
  const database = new CapabilityDatabase({ dbPath: tempJson("p2-cancel-noop-db"), preferSqlite: false });
  const result = await ExecutionEngine.run("webai.chatgpt.send_prompt", { run_id: "nonexistent-run-id", profile: "p", prompt: "x", confirmed: true }, {
    database,
    cancelRegistry,
    leaseStore: store,
    page: page(),
    profilePool: { async acquireProfile(_profile: string, run_id: string) { return { leaseId: `l-${run_id}`, heartbeat: () => undefined, renew: () => undefined, releaseFn: async () => undefined }; } }
  } as any);
  assert.equal(result.status, "cancelled");
});
