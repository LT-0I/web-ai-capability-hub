import { objectSchema, scalar } from "../../utils/schema";
import { CapabilityDatabase } from "../../capabilities/database";

export const wahTaskStatusInput = objectSchema<{ run_id: string }>({ run_id: scalar.string("Run id returned by wah_task_start") }, ["run_id"]);

export async function wahTaskStatus(args: { run_id: string }, runtime?: any): Promise<unknown> {
  const db = runtime?.database || new CapabilityDatabase();
  return { ok: true, run_id: args.run_id, workflow_run: db.getWorkflowRun(args.run_id) || null, events: db.listRunEvents(args.run_id) };
}
