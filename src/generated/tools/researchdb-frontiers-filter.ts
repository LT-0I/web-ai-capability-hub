import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbFrontiersFilterToolSpec: ToolSpec = {
  name: "research_frontiers_filter",
  description: "research_frontiers_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.frontiers.filter", args, runtime as any)
};

export default researchdbFrontiersFilterToolSpec;
