import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiTaskStatusToolSpec: ToolSpec = {
  name: "webai_task_status",
  description: "webai_task_status manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.task.status", args, runtime as any)
};

export default webaiTaskStatusToolSpec;
