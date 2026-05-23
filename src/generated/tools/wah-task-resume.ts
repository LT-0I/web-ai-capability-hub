import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahTaskResumeToolSpec: ToolSpec = {
  name: "wah_task_resume",
  description: "Resume or re-plan a manifest-backed task run from persisted evidence.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.task.resume", args, runtime as any)
};

export default wahTaskResumeToolSpec;
