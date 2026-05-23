import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskCancelToolSpec: ToolSpec = {
  name: "wah_task_cancel",
  description: "Request cancellation for a manifest-backed task run.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.task.cancel", args, runtime as any)
};

export default wahTaskCancelToolSpec;
