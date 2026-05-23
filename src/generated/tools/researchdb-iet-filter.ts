import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIetFilterToolSpec: ToolSpec = {
  name: "research_iet_filter",
  description: "research_iet_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iet.filter", args, runtime as any)
};

export default researchdbIetFilterToolSpec;
