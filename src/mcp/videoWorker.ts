#!/usr/bin/env node
import { CapabilityDatabase } from "../capabilities/database";
import { runGeminiVideoTaskWorker } from "./tools";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const taskId = readArg("--task-id");
  const dbPath = readArg("--db-path");
  const argsB64 = readArg("--args-b64");
  if (!taskId || !dbPath || !argsB64) throw new Error("video worker requires --task-id, --db-path, and --args-b64");
  const args = JSON.parse(Buffer.from(argsB64, "base64url").toString("utf-8"));
  await runGeminiVideoTaskWorker(taskId, args, new CapabilityDatabase({ dbPath }));
}

if (require.main === module) {
  main().catch((error) => {
    // Terminal state is normally written by runGeminiVideoTaskWorker. This
    // catch is only for argument/bootstrap failures before a task can run.
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
