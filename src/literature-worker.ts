#!/usr/bin/env node
import { assertLiteratureQuota, recordLiteratureDownload } from "./runtime/literature/quota";
import {
  claimNextTaskForDb,
  listQueuedLiteratureDbSlugs,
  markTaskDone,
  markTaskFailed,
  markTaskRunning,
  resetRunningLiteratureTasks
} from "./runtime/literature/queue";
import { getLiteratureDriver } from "./runtime/literature/drivers";

const SCAN_INTERVAL_MS = 5000;
const MIN_JITTER_MS = 30_000;
const MAX_JITTER_MS = 180_000;

let stopping = false;
const busyDbSlugs = new Set<string>();
const inFlight = new Set<Promise<void>>();
let wakeScanner: (() => void) | null = null;

function now(): number {
  return Date.now();
}

function log(message: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), component: "literature-worker", message, ...fields }));
}

function jitterMs(): number {
  return MIN_JITTER_MS + Math.floor(Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS + 1));
}

function sleep(ms: number): Promise<void> {
  if (stopping) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (wakeScanner === resolve) wakeScanner = null;
      resolve();
    }, ms);
    wakeScanner = () => {
      clearTimeout(timer);
      if (wakeScanner === resolve) wakeScanner = null;
      resolve();
    };
  });
}

async function runClaimedTask(db_slug: string, task: { task_id: string; doc_id: string; requested_url: string | null }): Promise<void> {
  const delay = jitterMs();
  log("task claimed; waiting jitter before driver", { db_slug, task_id: task.task_id, delay_ms: delay });
  await new Promise((resolve) => setTimeout(resolve, delay));
  try {
    const driver = getLiteratureDriver(db_slug);
    if (!driver) throw new Error(`no driver registered for db: ${db_slug}`);
    const result = await driver({ db_slug, doc_id: task.doc_id, requested_url: task.requested_url });
    const completedAt = now();
    recordLiteratureDownload(db_slug, task.doc_id, result.path, result.sha256, result.resolved_url, completedAt);
    markTaskDone(task.task_id, result.path, completedAt);
    log("task done", { db_slug, task_id: task.task_id, path: result.path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markTaskFailed(task.task_id, message, now());
    log("task failed", { db_slug, task_id: task.task_id, error: message });
  } finally {
    busyDbSlugs.delete(db_slug);
  }
}

function spawnClaimedTask(db_slug: string, task: { task_id: string; doc_id: string; requested_url: string | null }): void {
  busyDbSlugs.add(db_slug);
  const promise = runClaimedTask(db_slug, task)
    .catch((error) => log("task runner crashed", { db_slug, task_id: task.task_id, error: error instanceof Error ? error.message : String(error) }))
    .finally(() => inFlight.delete(promise));
  inFlight.add(promise);
}

async function scanOnce(): Promise<void> {
  const queuedDbSlugs = listQueuedLiteratureDbSlugs();
  for (const db_slug of queuedDbSlugs) {
    if (stopping) return;
    if (busyDbSlugs.has(db_slug)) continue;
    const quota = assertLiteratureQuota(db_slug, now());
    if (!quota.allowed) {
      log("quota cap reached; deferring db", { db_slug, retry_after_ms: quota.retryAfterMs });
      continue;
    }
    const claimedAt = now();
    const task = claimNextTaskForDb(db_slug, claimedAt);
    if (!task) continue;
    markTaskRunning(task.task_id, claimedAt);
    spawnClaimedTask(db_slug, task);
  }
}

function installSignalHandlers(): void {
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    log("shutdown requested", { signal, in_flight: inFlight.size });
    if (wakeScanner) wakeScanner();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

export async function runLiteratureWorker(): Promise<void> {
  installSignalHandlers();
  const reverted = resetRunningLiteratureTasks(now());
  log("started", { scan_interval_ms: SCAN_INTERVAL_MS, jitter_min_ms: MIN_JITTER_MS, jitter_max_ms: MAX_JITTER_MS, reverted_running_tasks: reverted });
  while (!stopping) {
    await scanOnce();
    await sleep(SCAN_INTERVAL_MS);
  }
  if (inFlight.size > 0) {
    log("waiting for in-flight tasks", { in_flight: inFlight.size });
    await Promise.allSettled([...inFlight]);
  }
  log("stopped");
}

if (require.main === module) {
  runLiteratureWorker().catch((error) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), component: "literature-worker", message: "fatal", error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
