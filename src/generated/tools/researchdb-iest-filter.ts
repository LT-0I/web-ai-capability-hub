import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIestFilterToolSpec: ToolSpec = {
  name: "research_iest_filter",
  description: "research_iest_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iest.filter", args, runtime as any)
};

export default researchdbIestFilterToolSpec;
