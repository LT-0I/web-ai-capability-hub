import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSciencedirectSearchToolSpec: ToolSpec = {
  name: "research_sciencedirect_search",
  description: "research_sciencedirect_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sciencedirect.search", args, runtime as any)
};

export default researchdbSciencedirectSearchToolSpec;
