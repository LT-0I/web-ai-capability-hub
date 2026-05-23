import test from "node:test";
import assert from "node:assert/strict";
import { runLegacyAlias } from "../src/facade/legacy/aliases";
import { wahTaskCancel } from "../src/facade/wah/taskCancel";
import { wahTaskResume } from "../src/facade/wah/taskResume";
import { CancelRegistry } from "../src/runtime/cancel/registry";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { HealService } from "../src/runtime/heal/service";
import { CapabilityDatabase } from "../src/capabilities/database";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }
function page(): any {
  const locator = () => {
    const loc: any = { first: () => loc, count: async () => 1, click: async () => undefined, fill: async () => undefined, innerText: async () => "" };
    return loc;
  };
  return { locator, getByRole: () => ({ count: async () => 0 }), title: async () => "", url: () => "about:blank", keyboard: { press: async () => undefined } };
}
function profilePool(released: string[]) {
  return {
    async acquireProfile(_profile: string, runId: string) {
      return {
        leaseId: `lease-${runId}`,
        profileId: "gemini-veo",
        runId,
        cdpEndpoint: "http://127.0.0.1:9225",
        heartbeat: () => undefined,
        renew: () => undefined,
        releaseFn: async (status = "released") => { released.push(status); }
      };
    }
  };
}

function cancelRuntime(runId: string, released: string[]) {
  const store = new RuntimeLeaseStore(tempPath("cancel-store"));
  const cancelRegistry = new CancelRegistry(store);
  const database = new CapabilityDatabase({ dbPath: tempPath("cancel-db"), preferSqlite: false });
  return {
    runtime: {
      database,
      cancelRegistry,
      leaseStore: store,
      healService: new HealService(store),
      profilePool: profilePool(released),
      page: page(),
      onRunEvent: async (event: any) => {
        if (event.kind === "action.observe" && event.status === "succeeded") {
          await wahTaskCancel({ run_id: runId, reason: "test mid-run cancel" }, { cancelRegistry });
        }
      }
    },
    cancelRegistry,
    database,
    store
  };
}

test("wah_task_cancel mid-run transitions state to Cancelled and releases leases", async () => {
  const released: string[] = [];
  const runId = "run-cancel-flow";
  const { runtime } = cancelRuntime(runId, released);
  const result = await runLegacyAlias("webai_gemini_generate_video", { run_id: runId, profile: "gemini-veo", prompt: "short clip", confirmed: true }, runtime as any);
  assert.equal(result.ok, false);
  assert.equal(result.status, "cancelled");
  assert.equal(result.errorCode, undefined, "cancel is deliberate state, not a failure code");
  assert.ok(result.events.map((event) => event.state).includes("Cancelled"));
  assert.ok(result.runEvents.some((event) => event.kind === "lifecycle.cancelled"));
  assert.deepEqual(released, ["cancelled"]);
});

test("wah_task_resume picks up after a cancelled run and finishes the remaining steps", async () => {
  const released: string[] = [];
  const runId = "run-resume-flow";
  const first = cancelRuntime(runId, released);
  const cancelled = await runLegacyAlias("webai_gemini_generate_video", { run_id: runId, profile: "gemini-veo", prompt: "short clip", confirmed: true }, first.runtime as any);
  assert.equal(cancelled.status, "cancelled");

  const resumedReleased: string[] = [];
  const resumeRuntime = {
    database: first.database,
    cancelRegistry: first.cancelRegistry,
    leaseStore: first.store,
    healService: new HealService(first.store),
    profilePool: profilePool(resumedReleased),
    page: page()
  };
  const resumed: any = await wahTaskResume({ run_id: runId, manifest_id: "webai.gemini.generate_video", input: { profile: "gemini-veo", prompt: "finish clip" }, confirmed: true }, resumeRuntime);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, "completed");
  assert.ok(resumed.runEvents.some((event: any) => event.kind === "resume.skip_completed_action" && event.stepId === "01-observe"));
  assert.ok(resumed.runEvents.some((event: any) => event.kind === "action.type" || event.kind === "action.click"));
  assert.deepEqual(resumedReleased, ["released"]);
});
