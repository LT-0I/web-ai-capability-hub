import { objectSchema, scalar } from "../../utils/schema";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskResumeInput = objectSchema<{ run_id: string; manifest_id: string; input?: Record<string, unknown>; confirmed?: boolean }>({
  run_id: scalar.string("Prior run id to resume"),
  manifest_id: scalar.string("Manifest id to resume"),
  input: scalar.object("Additional input for the resumed run"),
  confirmed: scalar.boolean("Set true when a policy gate has been approved")
}, ["run_id", "manifest_id"]);

export async function wahTaskResume(args: { run_id: string; manifest_id: string; input?: Record<string, unknown>; confirmed?: boolean }, runtime?: any): Promise<unknown> {
  return ExecutionEngine.run(args.manifest_id, { ...(args.input || {}), resume_of: args.run_id, confirmed: args.confirmed }, runtime || {});
}
