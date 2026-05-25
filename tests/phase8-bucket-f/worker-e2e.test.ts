import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-f-live-arxiv-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

const WORKER_SCRIPT = path.resolve(process.cwd(), "dist/src/literature-worker.js");
const LIVE_ARXIV_DOCS = ["1706.03762", "1810.04805", "2005.14165"];

type RuntimeModules = {
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
};

let runtimeModules: Promise<RuntimeModules> | undefined;
async function loadRuntimeModules(): Promise<RuntimeModules> {
  runtimeModules ||= Promise.all([
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue")
  ]).then(([quota, queue]) => ({ quota, queue }));
  return runtimeModules;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child: any, timeoutMs: number): Promise<{ code: number | null; signal: string | null }> {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => reject(new Error(`worker did not exit within ${timeoutMs}ms`)), timeoutMs);
    child.once("exit", (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function startWorker(t: any): { stop: () => Promise<{ stdout: string; stderr: string; exit: { code: number | null; signal: string | null } }> } {
  const child = spawn(process.execPath, [WORKER_SCRIPT], {
    cwd: tempRoot,
    env: {
      ...process.env,
      WEBAI_LITERATURE_RATE_LIMIT_DB: process.env.WEBAI_LITERATURE_RATE_LIMIT_DB,
      WEBAI_LITERATURE_QUEUE_DB: process.env.WEBAI_LITERATURE_QUEUE_DB,
      LITERATURE_WORKER_JITTER_MIN_MS: "10",
      LITERATURE_WORKER_JITTER_MAX_MS: "50"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: any) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: any) => { stderr += chunk.toString(); });

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await waitForExit(child, 5000).catch(() => child.kill("SIGKILL"));
    }
  });

  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const exit = await waitForExit(child, 5000);
    return { stdout, stderr, exit };
  }

  return { stop };
}

function queueRows(): Array<{ task_id: string; db_slug: string; doc_id: string; status: string; started_at: number | null; completed_at: number | null; result_path: string | null; error: string | null }> {
  const BetterSqlite3 = require("better-sqlite3");
  const db = new BetterSqlite3(process.env.WEBAI_LITERATURE_QUEUE_DB, { readonly: true });
  try {
    return db.prepare(`
      SELECT task_id, db_slug, doc_id, status, started_at, completed_at, result_path, error
      FROM download_queue
      ORDER BY id ASC
    `).all();
  } finally {
    db.close();
  }
}

async function waitForDone(expectedDone: number, timeoutMs = 120000): Promise<{ rows: ReturnType<typeof queueRows>; runningSeen: Set<string> }> {
  const deadline = Date.now() + timeoutMs;
  const runningSeen = new Set<string>();
  while (Date.now() < deadline) {
    const rows = queueRows();
    for (const row of rows) {
      if (row.status === "running") runningSeen.add(row.task_id);
    }
    const failed = rows.filter((row) => row.status === "fail");
    assert.deepEqual(failed, [], `worker failed queue rows: ${JSON.stringify(failed)}`);
    const done = rows.filter((row) => row.status === "done");
    if (done.length === expectedDone) return { rows, runningSeen };
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${expectedDone} done queue rows; rows=${JSON.stringify(queueRows())}`);
}

test("live arxiv worker daemon claims, downloads, records, and shuts down gracefully", {
  skip: process.env.PHASE8_LIVE_ARXIV === "1" ? false : "set PHASE8_LIVE_ARXIV=1 to run the live open-access arxiv worker e2e",
  timeout: 180000
}, async (t: any) => {
  const { quota, queue } = await loadRuntimeModules();
  queue.literatureQueueDbForInternalUse().prepare("DELETE FROM download_queue").run();
  quota.literatureLedgerDbForInternalUse().prepare("DELETE FROM download_ledger").run();

  const taskIds = LIVE_ARXIV_DOCS.map((docId, index) => queue.enqueueLiteratureDownload(
    "arxiv",
    docId,
    `https://arxiv.org/pdf/${docId}.pdf`,
    Date.now() + index
  ).task_id);
  assert.deepEqual(taskIds.map((taskId) => queue.getLiteratureTaskStatus(taskId)?.status), ["queued", "queued", "queued"]);

  const worker = startWorker(t);
  const { rows, runningSeen } = await waitForDone(3);
  assert.equal(rows.length, 3);
  assert.ok(taskIds.every((taskId) => runningSeen.has(taskId)), "all three arxiv tasks should transition queued→running→done");
  assert.ok(rows.every((row) => row.db_slug === "arxiv" && row.status === "done" && row.result_path && !row.error));

  const downloadDir = path.join(tempRoot, "data", "literature-downloads", "arxiv");
  const files = fs.readdirSync(downloadDir).filter((name: string) => name.endsWith(".pdf"));
  assert.equal(files.length, 3);
  for (const file of files) assert.ok(fs.statSync(path.join(downloadDir, file)).size > 0, `${file} should be non-empty`);

  const ledgerCount = quota.literatureLedgerDbForInternalUse()
    .prepare("SELECT COUNT(*) AS count FROM download_ledger WHERE db_slug = 'arxiv'")
    .get() as { count: number };
  assert.equal(Number(ledgerCount.count), 3);

  const stopped = await worker.stop();
  assert.equal(stopped.exit.code, 0, stopped.stderr || stopped.stdout);
  assert.match(stopped.stdout, /"message":"stopped"/);
});
