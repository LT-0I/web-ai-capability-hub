import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIncopatSearchToolSpec: ToolSpec = {
  name: "research_incopat_search",
  description: "research_incopat_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.incopat.search", args, runtime as any)
};

export default researchdbIncopatSearchToolSpec;
