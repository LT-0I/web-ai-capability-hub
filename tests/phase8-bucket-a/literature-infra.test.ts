import test from "node:test";
import assert from "node:assert/strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "webai-literature-infra-"));
process.env.WEBAI_LITERATURE_RATE_LIMIT_DB = path.join(tempRoot, "literature-rate-limit.sqlite");
process.env.WEBAI_LITERATURE_QUEUE_DB = path.join(tempRoot, "literature-queue.sqlite");

let runtimeModules: Promise<{
  errorCodes: typeof import("../../src/consumer/errorCodes");
  tools: typeof import("../../src/mcp/tools");
  quota: typeof import("../../src/runtime/literature/quota");
  queue: typeof import("../../src/runtime/literature/queue");
}> | undefined;

async function loadRuntimeModules() {
  runtimeModules ||= Promise.all([
    import("../../src/consumer/errorCodes"),
    import("../../src/mcp/tools"),
    import("../../src/runtime/literature/quota"),
    import("../../src/runtime/literature/queue")
  ]).then(([errorCodes, tools, quota, queue]) => ({ errorCodes, tools, quota, queue }));
  return runtimeModules;
}

function uniqueSlug(label: string): string {
  return `phase8_${label}_${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function contract(): any {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
}

test("assertLiteratureQuota returns allowed=true on an empty ledger", async () => {
  const { quota: { assertLiteratureQuota, countDownloadsLast24h } } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("empty");
  const now = Date.now();
  assert.equal(countDownloadsLast24h(dbSlug, now), 0);
  assert.deepEqual(assertLiteratureQuota(dbSlug, now), { allowed: true });
});

test("20 ledger inserts hit the 20/DB/24h cap and expose retryAfterMs", async () => {
  const { quota: { assertLiteratureQuota, countDownloadsLast24h, recordLiteratureDownload } } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("cap");
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    recordLiteratureDownload(dbSlug, `doc-${i}`, `/tmp/${dbSlug}/doc-${i}.pdf`, `sha-${i}`, `https://example.test/${i}`, now + i);
  }
  assert.equal(countDownloadsLast24h(dbSlug, now + 19), 20);
  const quota = assertLiteratureQuota(dbSlug, now + 19);
  assert.equal(quota.allowed, false);
  assert.equal(typeof quota.retryAfterMs, "number");
  assert.ok((quota.retryAfterMs || 0) > 0);
});

test("21st ledger insert ages out after the 24h window", async () => {
  const { quota: { assertLiteratureQuota, recordLiteratureDownload } } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("travel");
  const now = Date.now();
  for (let i = 0; i < 21; i++) {
    recordLiteratureDownload(dbSlug, `doc-${i}`, `/tmp/${dbSlug}/doc-${i}.pdf`, `sha-${i}`, null, now + i);
  }
  assert.equal(assertLiteratureQuota(dbSlug, now + 21).allowed, false);
  assert.deepEqual(assertLiteratureQuota(dbSlug, now + 24 * 60 * 60 * 1000 + 22), { allowed: true });
});

test("enqueueLiteratureDownload and getLiteratureTaskStatus round-trip", async () => {
  const { queue: { enqueueLiteratureDownload, getLiteratureTaskStatus } } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("queue");
  const now = Date.now();
  const enqueued = enqueueLiteratureDownload(dbSlug, "doc-a", "https://example.test/doc-a", now);
  assert.match(enqueued.task_id, /^[0-9a-f-]{36}$/i);
  assert.equal(enqueued.queued_at, now);
  assert.deepEqual(getLiteratureTaskStatus(enqueued.task_id), {
    task_id: enqueued.task_id,
    db_slug: dbSlug,
    doc_id: "doc-a",
    status: "queued",
    queued_at: now,
    started_at: null,
    completed_at: null,
    result_path: null,
    error: null
  });
});

test("claimNextTaskForDb is idempotent and does not double-claim", async () => {
  const { queue: { claimNextTaskForDb, enqueueLiteratureDownload, getLiteratureTaskStatus } } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("claim");
  const now = Date.now();
  const enqueued = enqueueLiteratureDownload(dbSlug, "doc-claim", null, now);
  const first = claimNextTaskForDb(dbSlug, now + 1);
  assert.deepEqual(first, { task_id: enqueued.task_id, doc_id: "doc-claim", requested_url: null });
  assert.equal(claimNextTaskForDb(dbSlug, now + 2), null);
  const status = getLiteratureTaskStatus(enqueued.task_id);
  assert.equal(status?.status, "running");
  assert.equal(status?.started_at, now + 1);
});

test("LITERATURE_QUEUED is listed in the contract and TS error code export", async () => {
  const { errorCodes: { CONSUMER_ERROR_CODES } } = await loadRuntimeModules();
  assert.ok(contract().error_codes.includes("LITERATURE_QUEUED"));
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("LITERATURE_QUEUED"));
});

test("webai_literature_task_status routes through MCP and TS export", async () => {
  const {
    tools: { callMcpTool, listMcpTools, webAiLiteratureTaskStatus },
    queue: { enqueueLiteratureDownload }
  } = await loadRuntimeModules();
  const dbSlug = uniqueSlug("status");
  const now = Date.now();
  const enqueued = enqueueLiteratureDownload(dbSlug, "doc-status", "https://example.test/status", now);
  const row = contract().commands.find((command: any) => command.mcp_name === "webai_literature_task_status");
  assert.equal(row?.cli_name, "webai:literature-task-status");
  assert.equal(row?.ts_export, "webAiLiteratureTaskStatus");
  assert.equal(typeof webAiLiteratureTaskStatus, "function");
  assert.ok(listMcpTools().some((tool) => tool.name === "webai_literature_task_status"));

  const direct: any = await webAiLiteratureTaskStatus({ task_id: enqueued.task_id });
  assert.equal(direct.ok, true);
  assert.equal(direct.status, "queued");
  assert.equal(direct.errorCode, null);

  const viaMcp: any = await callMcpTool("webai_literature_task_status", { task_id: enqueued.task_id });
  assert.equal(viaMcp.ok, true);
  assert.equal(viaMcp.task_id, enqueued.task_id);
  assert.equal(viaMcp.db_slug, dbSlug);
  assert.equal(viaMcp.doc_id, "doc-status");
  assert.equal(viaMcp.status, "queued");
});
