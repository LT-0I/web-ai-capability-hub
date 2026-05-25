import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-phase8-bucket-f-stress-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");
process.env.LITERATURE_WORKER_JITTER_MIN_MS = "10";
process.env.LITERATURE_WORKER_JITTER_MAX_MS = "50";

const PDF_BYTES = Buffer.from("%PDF-1.7\nphase8-bucket-f\n%%EOF\n", "utf8");
const WORKER_SCRIPT = path.resolve(process.cwd(), "dist/src/literature-worker.js");
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

type RuntimeModules = {
  tools: typeof import("../../src/mcp/tools");
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
  worker: typeof import("../../src/literature-worker");
};

let runtimeModules: Promise<RuntimeModules> | undefined;
async function loadRuntimeModules(): Promise<RuntimeModules> {
  runtimeModules ||= Promise.all([
    import("../../src/mcp/tools"),
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue"),
    import("../../src/literature-worker")
  ]).then(([tools, quota, queue, worker]) => ({ tools, quota, queue, worker }));
  return runtimeModules;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetLiteratureState(): Promise<void> {
  const { quota, queue } = await loadRuntimeModules();
  queue.literatureQueueDbForInternalUse().prepare("DELETE FROM download_queue").run();
  quota.literatureLedgerDbForInternalUse().prepare("DELETE FROM download_ledger").run();
  fs.rmSync(path.join(tempRoot, "data"), { recursive: true, force: true });
  fs.rmSync(path.join(tempRoot, "direct"), { recursive: true, force: true });
}

async function startPdfServer(t: any, delayMs = 0): Promise<{ baseUrl: string; requests: Array<{ url: string; at: number }>; docUrl: (id: string) => string }> {
  const requests: Array<{ url: string; at: number }> = [];
  const server = http.createServer((req: any, res: any) => {
    requests.push({ url: req.url || "/", at: Date.now() });
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end(PDF_BYTES);
    }, delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    requests,
    docUrl: (id: string) => `${baseUrl}/${encodeURIComponent(id)}.pdf`
  };
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

function parseJsonLogLines(stdout: string): any[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function startWorker(t: any, extraEnv: Record<string, string> = {}): { child: any; stop: () => Promise<{ stdout: string; stderr: string; exit: { code: number | null; signal: string | null } }>; stdout: () => string; stderr: () => string } {
  const child = spawn(process.execPath, [WORKER_SCRIPT], {
    cwd: tempRoot,
    env: {
      ...process.env,
      WEBAI_LITERATURE_RATE_LIMIT_DB: process.env.WEBAI_LITERATURE_RATE_LIMIT_DB,
      WEBAI_LITERATURE_QUEUE_DB: process.env.WEBAI_LITERATURE_QUEUE_DB,
      LITERATURE_WORKER_JITTER_MIN_MS: "10",
      LITERATURE_WORKER_JITTER_MAX_MS: "50",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: any) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: any) => { stderr += chunk.toString(); });

  let stopped = false;
  async function stop() {
    if (!stopped && child.exitCode === null && child.signalCode === null) {
      stopped = true;
      child.kill("SIGTERM");
    }
    const exit = await waitForExit(child, 5000);
    return { stdout, stderr, exit };
  }
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await waitForExit(child, 5000).catch(() => child.kill("SIGKILL"));
    }
  });
  return { child, stop, stdout: () => stdout, stderr: () => stderr };
}

function queueRows(): Array<{ task_id: string; db_slug: string; doc_id: string; status: string; started_at: number | null; completed_at: number | null; result_path: string | null; error: string | null }> {
  const dbPath = process.env.WEBAI_LITERATURE_QUEUE_DB;
  assert.ok(dbPath);
  const BetterSqlite3 = require("better-sqlite3");
  const db = new BetterSqlite3(dbPath, { readonly: true });
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

async function waitForDone(expectedDone: number, timeoutMs = 30000): Promise<{ rows: ReturnType<typeof queueRows>; runningSeen: Set<string> }> {
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
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${expectedDone} done queue rows; rows=${JSON.stringify(queueRows())}`);
}

function countLedgerRows(db_slug: string): number {
  const dbPath = process.env.WEBAI_LITERATURE_RATE_LIMIT_DB;
  assert.ok(dbPath);
  const BetterSqlite3 = require("better-sqlite3");
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM download_ledger WHERE db_slug = ?").get(db_slug);
    return Number(row?.count || 0);
  } finally {
    db.close();
  }
}

test("25 arxiv requests respect the 20/DB/24h cap, enqueue 5, then drain after simulated 24h travel", { timeout: 45000 }, async (t: any) => {
  await resetLiteratureState();
  const server = await startPdfServer(t);
  const { tools, quota, queue } = await loadRuntimeModules();

  for (let i = 0; i < 20; i++) {
    const result: any = await tools.webAiArxivDownloadPdf({
      doc_id: server.docUrl(`direct-${i}`),
      output_dir: path.join(tempRoot, "direct", "arxiv")
    });
    assert.equal(result.ok, true);
    assert.equal(result.errorCode, null);
    assert.ok(result.path);
  }
  assert.equal(quota.countDownloadsLast24h("arxiv", Date.now()), 20);

  const queuedIds: string[] = [];
  for (let i = 20; i < 25; i++) {
    const result: any = await tools.webAiArxivDownloadPdf({ doc_id: server.docUrl(`queued-${i}`) });
    assert.equal(result.ok, true);
    assert.equal(result.errorCode, "LITERATURE_QUEUED");
    assert.match(result.task_id, /^[0-9a-f-]{36}$/i);
    queuedIds.push(result.task_id);
  }
  assert.deepEqual(queuedIds.map((taskId) => queue.getLiteratureTaskStatus(taskId)?.status), ["queued", "queued", "queued", "queued", "queued"]);

  quota.literatureLedgerDbForInternalUse()
    .prepare("UPDATE download_ledger SET downloaded_at = ? WHERE db_slug = 'arxiv'")
    .run(Date.now() - WINDOW_24H_MS - 1000);
  assert.equal(quota.assertLiteratureQuota("arxiv", Date.now()).allowed, true);

  const worker = startWorker(t);
  const { rows, runningSeen } = await waitForDone(5);
  const finalQueuedRows = rows.filter((row) => queuedIds.includes(row.task_id));
  assert.equal(finalQueuedRows.length, 5);
  assert.ok(finalQueuedRows.every((row) => row.status === "done"));
  assert.ok(queuedIds.every((taskId) => runningSeen.has(taskId)), "all queued rows should have been observed in running state before done");

  const stopped = await worker.stop();
  assert.equal(stopped.exit.code, 0, stopped.stderr || stopped.stdout);
  assert.match(stopped.stdout, /"message":"stopped"/);
  assert.equal(countLedgerRows("arxiv"), 25);
  const downloadDir = path.join(tempRoot, "data", "literature-downloads", "arxiv");
  assert.equal(fs.readdirSync(downloadDir).filter((name: string) => name.endsWith(".pdf")).length, 5);
});

test("worker keeps one in-flight task per DB while allowing arxiv and scoap3 to run in parallel", { timeout: 45000 }, async (t: any) => {
  await resetLiteratureState();
  const server = await startPdfServer(t, 80);
  const { queue } = await loadRuntimeModules();
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    queue.enqueueLiteratureDownload("arxiv", `arxiv-${i}`, server.docUrl(`arxiv-${i}`), now + i);
    queue.enqueueLiteratureDownload("scoap3", `scoap3-${i}`, server.docUrl(`scoap3-${i}`), now + 100 + i);
  }

  const worker = startWorker(t);
  const { rows } = await waitForDone(20);
  const stopped = await worker.stop();
  assert.equal(stopped.exit.code, 0, stopped.stderr || stopped.stdout);

  for (const db_slug of ["arxiv", "scoap3"]) {
    const dbRows = rows.filter((row) => row.db_slug === db_slug);
    assert.equal(dbRows.length, 10);
    for (let i = 1; i < dbRows.length; i++) {
      assert.ok((dbRows[i].started_at || 0) >= (dbRows[i - 1].completed_at || 0), `${db_slug} task ${i} started before previous task completed`);
    }
  }

  const firstArxiv = rows.find((row) => row.db_slug === "arxiv");
  const firstScoap3 = rows.find((row) => row.db_slug === "scoap3");
  assert.ok(firstArxiv && firstScoap3);
  assert.ok((firstArxiv.started_at || 0) <= (firstScoap3.completed_at || 0));
  assert.ok((firstScoap3.started_at || 0) <= (firstArxiv.completed_at || 0), "first arxiv and scoap3 tasks should overlap, proving cross-DB parallelism");
});

test("worker jitter defaults are documented and test env hooks constrain claimed-task delay", { timeout: 45000 }, async (t: any) => {
  await resetLiteratureState();
  const server = await startPdfServer(t);
  const { queue, worker: workerModule } = await loadRuntimeModules();

  assert.deepEqual(workerModule.literatureWorkerJitterRangeForInternalUse(), { min_ms: 10, max_ms: 50 });
  assert.equal(workerModule.literatureWorkerJitterMsForInternalUse(() => 0), 10);
  assert.equal(workerModule.literatureWorkerJitterMsForInternalUse(() => 0.999), 50);

  const source = fs.readFileSync(path.resolve(process.cwd(), "src/literature-worker.ts"), "utf8");
  assert.match(source, /DEFAULT_LITERATURE_WORKER_JITTER_MIN_MS\s*=\s*30_000/);
  assert.match(source, /DEFAULT_LITERATURE_WORKER_JITTER_MAX_MS\s*=\s*180_000/);
  assert.match(source, /30-180s/);
  assert.match(source, /30000-180000ms/);

  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    queue.enqueueLiteratureDownload("arxiv", `jitter-${i}`, server.docUrl(`jitter-${i}`), now + i);
  }

  const worker = startWorker(t, {
    LITERATURE_WORKER_JITTER_MIN_MS: "10",
    LITERATURE_WORKER_JITTER_MAX_MS: "50"
  });
  await waitForDone(5);
  const stopped = await worker.stop();
  assert.equal(stopped.exit.code, 0, stopped.stderr || stopped.stdout);
  const claimed = parseJsonLogLines(stopped.stdout).filter((line) => line.message === "task claimed; waiting jitter before driver");
  assert.equal(claimed.length, 5, stopped.stdout);
  assert.ok(claimed.every((line) => line.delay_ms >= 10 && line.delay_ms <= 50), JSON.stringify(claimed));
});
