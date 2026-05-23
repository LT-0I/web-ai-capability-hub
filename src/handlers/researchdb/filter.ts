import { ExecutionRuntime, RunResult, ExecutionEngine } from "../../runtime/exec/engine";

export async function runResearchDbFilter(args: Record<string, unknown>, runtime?: ExecutionRuntime): Promise<RunResult> {
  const manifestId = String(args.manifest_id || args.manifestId || "researchdb.unknown.filter");
  return ExecutionEngine.run(manifestId, args, runtime || {});
}
