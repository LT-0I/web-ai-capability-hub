import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbNatureSearchToolSpec: ToolSpec = {
  name: "research_nature_search",
  description: "research_nature_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.nature.search", args, runtime as any)
};

export default researchdbNatureSearchToolSpec;
