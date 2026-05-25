const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
import { CapabilityDatabase } from "../src/capabilities/database";
import { ConsumerErrorCodes } from "../src/consumer/errorCodes";
import { GeminiQuotaStateStore } from "../src/browser/geminiQuotaStateStore";
import { resolveGeminiAccountPool, runGeminiVideoTaskWorker, webAiGeminiGenerateVideo, WebAiToolError } from "../src/mcp/tools";

function tempRoot(prefix = "wah-gemini-"): string { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function tempDb(): CapabilityDatabase {
  const dir = tempRoot("wah-gemini-db-");
  return new CapabilityDatabase({ dbPath: path.join(dir, "capability.json"), preferSqlite: false });
}
function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try { fn(); } finally { if (prev === undefined) delete process.env[name]; else process.env[name] = prev; }
}
async function withCwd<T>(dir: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try { return await fn(); } finally { process.chdir(prev); }
}
function readState(root: string): any {
  const file = path.join(root, "data", "browser-profiles", "gemini-quota-state.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : { accounts: {} };
}
async function runRotationCase(opts: {
  pool?: any[];
  root?: string;
  generate: (args: any) => Promise<void> | void;
  args?: Record<string, unknown>;
}): Promise<{ db: CapabilityDatabase; task: any; calls: string[]; root: string }> {
  const root = opts.root || tempRoot();
  const db = tempDb();
  const taskId = `task_${Math.random().toString(16).slice(2)}`;
  const args: any = { profile: "A", prompt: "video", download_dir: root, timeout_ms: 1000, ...(opts.args || {}) };
  if (opts.pool) args.__resolvedPool = opts.pool;
  args.__quotaStateRoot = root;
  const calls: string[] = [];
  await withCwd(root, async () => {
    await runGeminiVideoTaskWorker(taskId, args, db, {
      generateGeminiVideo: async (attemptArgs: any, _runtime: any, record: any) => {
        calls.push(attemptArgs.profile);
        await opts.generate(attemptArgs);
        record.result = { path: "/tmp/fake.mp4", sha256: "sha", size_bytes: 12, download_filename: "fake.mp4" };
      }
    } as any);
  });
  return { db, task: db.getWebAiTask(taskId), calls, root };
}

test("resolveGeminiAccountPool precedence, dedupe, and bound-first ordering", async () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, "configs"), { recursive: true });
  fs.writeFileSync(path.join(root, "configs", "gemini-account-pool.json"), JSON.stringify({ version: 1, pools: { "gemini-video": [{ profile: "cfgA", cdp_port: 9101 }, { profile: "bound", cdp_port: 9222 }, { profile: "cfgA" }] } }));
  await withCwd(root, async () => {
    withEnv("WAH_GEMINI_VIDEO_POOL", undefined, () => {
      assert.deepEqual(resolveGeminiAccountPool({ profile: "bound", account_pool: " argA, bound, argA , argB " }), [
        { profile: "bound" }, { profile: "argA" }, { profile: "argB" }
      ]);
      withEnv("WAH_GEMINI_VIDEO_POOL", "envA,bound,envB", () => {
        assert.deepEqual(resolveGeminiAccountPool({ profile: "bound" }), [
          { profile: "bound" }, { profile: "envA" }, { profile: "envB" }
        ]);
      });
      assert.deepEqual(resolveGeminiAccountPool({ profile: "bound" }), [
        { profile: "bound", cdp_port: 9222 }, { profile: "cfgA", cdp_port: 9101 }
      ]);
    });
  });
});

test("resolveGeminiAccountPool falls back to the bound profile when no pool is declared", async () => {
  const root = tempRoot();
  await withCwd(root, async () => {
    withEnv("WAH_GEMINI_VIDEO_POOL", undefined, () => {
      assert.deepEqual(resolveGeminiAccountPool({ profile: "solo" }), [{ profile: "solo" }]);
    });
  });
});

test("GeminiQuotaStateStore marks, clears, expires, and fail-safes malformed JSON", () => {
  const root = tempRoot();
  let now = new Date("2026-05-17T00:00:00.000Z");
  withEnv("WAH_GEMINI_QUOTA_COOLDOWN_HOURS", "1", () => {
    const store = new GeminiQuotaStateStore(root, { now: () => now });
    store.markExhausted("A", ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
    assert.equal(store.isCooledDown("A"), true);
    store.clear("A");
    assert.equal(store.isCooledDown("A"), false);
    store.markExhausted("A", ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
    now = new Date("2026-05-17T01:00:01.000Z");
    assert.equal(store.isCooledDown("A"), false);
    fs.writeFileSync(store.statePath, "{not json");
    assert.equal(store.isCooledDown("A"), false);
  });
});

test("Gemini video rotation marks quota-exhausted A then succeeds on B", async () => {
  const result = await runRotationCase({
    pool: [{ profile: "A" }, { profile: "B" }],
    generate: (args) => { if (args.profile === "A") throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "quota"); }
  });
  assert.equal(result.task.status, "done");
  assert.equal(result.task.result.account_rotations, 1);
  assert.equal(result.task.result.accounts_tried_count, 2);
  assert.deepEqual(result.calls, ["A", "B"]);
  const state = readState(result.root);
  assert.ok(state.accounts.A);
  assert.equal(state.accounts.B, undefined);
});

test("Gemini video ELEMENT_NOT_FOUND does not rotate or mark quota exhausted", async () => {
  const result = await runRotationCase({
    pool: [{ profile: "A" }, { profile: "B" }],
    generate: () => { throw new WebAiToolError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "missing"); }
  });
  assert.equal(result.task.status, "failed");
  assert.equal(result.task.errorCode, ConsumerErrorCodes.ELEMENT_NOT_FOUND);
  assert.deepEqual(result.calls, ["A"]);
  assert.equal(readState(result.root).accounts.A, undefined);
});

test("Gemini video COMMAND_TIMEOUT does not rotate or mark quota exhausted", async () => {
  const result = await runRotationCase({
    pool: [{ profile: "A" }, { profile: "B" }],
    generate: () => { throw new WebAiToolError(ConsumerErrorCodes.COMMAND_TIMEOUT, "timeout"); }
  });
  assert.equal(result.task.status, "failed");
  assert.equal(result.task.errorCode, ConsumerErrorCodes.COMMAND_TIMEOUT);
  assert.deepEqual(result.calls, ["A"]);
  assert.equal(readState(result.root).accounts.A, undefined);
});

test("Gemini video quota on all accounts fails honestly with PLAN_OR_QUOTA_REQUIRED", async () => {
  const result = await runRotationCase({
    pool: [{ profile: "A" }, { profile: "B" }],
    generate: () => { throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "quota"); }
  });
  assert.equal(result.task.status, "failed");
  assert.equal(result.task.errorCode, ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
  assert.equal(result.task.result.accounts_tried_count, 2);
  assert.equal(result.task.progress_label, "all pooled Gemini accounts quota-exhausted");
});

test("Gemini video all cooled-down at entry fails without generation calls", async () => {
  const root = tempRoot();
  const store = new GeminiQuotaStateStore(root);
  store.markExhausted("A", ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
  store.markExhausted("B", ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
  const result = await runRotationCase({
    root,
    pool: [{ profile: "A" }, { profile: "B" }],
    generate: () => { throw new Error("should not run"); }
  });
  assert.equal(result.task.status, "failed");
  assert.equal(result.task.errorCode, ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
  assert.deepEqual(result.calls, []);
});

test("Gemini video single-profile default remains a single generation attempt", async () => {
  const result = await runRotationCase({
    pool: undefined,
    generate: () => { throw new WebAiToolError(ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED, "quota"); },
    args: { account_pool: undefined }
  });
  assert.equal(result.task.status, "failed");
  assert.equal(result.task.errorCode, ConsumerErrorCodes.PLAN_OR_QUOTA_REQUIRED);
  assert.deepEqual(result.calls, ["A"]);
  assert.equal(result.task.result.accounts_tried_count, 1);
});

test("startGeminiVideoTask rejects busy pool members before spawning worker", async () => {
  const root = tempRoot();
  const db = tempDb();
  db.upsertWebAiTask({ task_id: "task_busy", status: "running", profile: "B", lease_id: "lease_busy", started_at: new Date().toISOString() });
  await assert.rejects(
    () => webAiGeminiGenerateVideo({ backend: "managed-cdp", profile: "A", account_pool: "A,B", prompt: "video", download_dir: root }, { database: db, spawnVideoWorker: () => ({ pid: process.pid }) } as any),
    (error: any) => error?.errorCode === ConsumerErrorCodes.PROFILE_LEASE_BUSY
  );
});

test("startGeminiVideoTask rejects malformed account_pool before spawning worker", async () => {
  const root = tempRoot();
  const db = tempDb();
  let spawned = false;
  await assert.rejects(
    () => webAiGeminiGenerateVideo({ backend: "managed-cdp", profile: "A", account_pool: "A,,B", prompt: "video", download_dir: root }, { database: db, spawnVideoWorker: () => { spawned = true; return { pid: process.pid }; } } as any),
    (error: any) => error?.errorCode === ConsumerErrorCodes.INVALID_ARGS
  );
  assert.equal(spawned, false);
});
