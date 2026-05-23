import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDblpSearchToolSpec: ToolSpec = {
  name: "research_dblp_search",
  description: "research_dblp_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.dblp.search", args, runtime as any)
};

export default researchdbDblpSearchToolSpec;
