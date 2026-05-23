import { objectSchema, scalar } from "../../utils/schema";
import { requestCancel } from "../../runtime/cancel/registry";

export const wahTaskCancelInput = objectSchema<{ run_id: string; reason?: string }>({
  run_id: scalar.string("Run id to cancel"),
  reason: scalar.string("Human-readable cancellation reason")
}, ["run_id"]);

export async function wahTaskCancel(args: { run_id: string; reason?: string }, runtime?: any): Promise<unknown> {
  const signal = runtime?.cancelRegistry?.request ? runtime.cancelRegistry.request(args.run_id, args.reason) : requestCancel(args.run_id, args.reason);
  return { ok: true, status: "cancel_requested", ...signal };
}
