import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbFrontiersSearchToolSpec: ToolSpec = {
  name: "research_frontiers_search",
  description: "research_frontiers_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.frontiers.search", args, runtime as any)
};

export default researchdbFrontiersSearchToolSpec;
