import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskStartToolSpec: ToolSpec = {
  name: "wah_task_start",
  description: "Start a manifest-backed task or return its dry-run execution plan.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.task.start", args, runtime as any)
};

export default wahTaskStartToolSpec;
