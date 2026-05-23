import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWileySearchToolSpec: ToolSpec = {
  name: "research_wiley_search",
  description: "research_wiley_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wiley.search", args, runtime as any)
};

export default researchdbWileySearchToolSpec;
