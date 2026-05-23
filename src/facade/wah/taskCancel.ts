import { objectSchema, scalar } from "../../utils/schema";
import { requestCancel } from "../../runtime/cancel/registry";

export const wahTaskCancelInput = objectSchema<{ run_id: string; reason?: string }>({
  run_id: scalar.string("Run id to cancel"),
  reason: scalar.string("Human-readable cancellation reason")
}, ["run_id"]);

export async function wahTaskCancel(args: { run_id: string; reason?: string }): Promise<unknown> {
  return { ok: true, status: "cancel_requested", ...requestCancel(args.run_id, args.reason) };
}
