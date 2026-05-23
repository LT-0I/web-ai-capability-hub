import { objectSchema, scalar } from "../../utils/schema";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskStartInput = objectSchema<{ manifest_id: string; input?: Record<string, unknown>; dry_run?: boolean; confirmed?: boolean }>({
  manifest_id: scalar.string("Manifest id to execute"),
  input: scalar.object("Input object passed to the manifest handler"),
  dry_run: scalar.boolean("Return the execution plan without executing browser actions"),
  confirmed: scalar.boolean("Set true when a policy gate has been approved")
}, ["manifest_id"]);

export async function wahTaskStart(args: { manifest_id: string; input?: Record<string, unknown>; dry_run?: boolean; confirmed?: boolean }, runtime?: any): Promise<unknown> {
  return ExecutionEngine.run(args.manifest_id, { ...(args.input || {}), dry_run: args.dry_run, confirmed: args.confirmed }, runtime || {});
}
