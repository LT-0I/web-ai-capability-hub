import { ExecutionRuntime, RunResult, ExecutionEngine } from "../../runtime/exec/engine";

export async function runResearchDbExport(args: Record<string, unknown>, runtime?: ExecutionRuntime): Promise<RunResult> {
  const manifestId = String(args.manifest_id || args.manifestId || "researchdb.unknown.export");
  return ExecutionEngine.run(manifestId, args, runtime || {});
}
