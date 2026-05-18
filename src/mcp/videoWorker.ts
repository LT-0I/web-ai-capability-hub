#!/usr/bin/env node
import { CapabilityDatabase } from "../capabilities/database";
import type { WebAiTaskRecord } from "../capabilities/schemas";
import { ConsumerErrorCodes } from "../consumer/errorCodes";
import { runGeminiVideoTaskWorker } from "./tools";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function workerDatabase(dbPath: string): CapabilityDatabase {
  return new CapabilityDatabase({ dbPath, ...(dbPath.endsWith(".json") ? { preferSqlite: false } : {}) });
}

async function main(): Promise<void> {
  const taskId = readArg("--task-id");
  const dbPath = readArg("--db-path");
  const argsB64 = readArg("--args-b64");
  if (!taskId || !dbPath || !argsB64) throw new Error("video worker requires --task-id, --db-path, and --args-b64");
  const args = JSON.parse(Buffer.from(argsB64, "base64url").toString("utf-8"));
  await runGeminiVideoTaskWorker(taskId, args, workerDatabase(dbPath));
}

export function bestEffortMarkVideoTaskBootstrapFailure(): void {
  const taskId = readArg("--task-id");
  const dbPath = readArg("--db-path");
  if (!taskId || !dbPath) return;
  try {
    const database = workerDatabase(dbPath);
    const current = database.getWebAiTask(taskId);
    if (current && !["queued", "running"].includes(current.status)) return;
    const fallback: WebAiTaskRecord = {
      task_id: taskId,
      status: "running",
      profile: "unknown",
      lease_id: `lease_bootstrap_${Date.now()}`,
      started_at: new Date().toISOString()
    };
    database.upsertWebAiTask({
      ...(current || fallback),
      status: "failed",
      errorCode: ConsumerErrorCodes.COMMAND_TIMEOUT,
      progress_label: `failed: ${ConsumerErrorCodes.COMMAND_TIMEOUT}`
    });
  } catch {
    // Best-effort terminal safety: logging is handled by the bootstrap catch.
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Terminal state is normally written by runGeminiVideoTaskWorker. This
    // catch is only for argument/bootstrap failures before a task can run.
    bestEffortMarkVideoTaskBootstrapFailure();
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
