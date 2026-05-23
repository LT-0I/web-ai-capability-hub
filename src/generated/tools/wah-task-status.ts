import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskStatusToolSpec: ToolSpec = {
  name: "wah_task_status",
  description: "Read status and event metadata for a manifest-backed task run.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.task.status", args, runtime as any)
};

export default wahTaskStatusToolSpec;
