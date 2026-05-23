import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSpringerSearchToolSpec: ToolSpec = {
  name: "research_springer_search",
  description: "research_springer_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.springer.search", args, runtime as any)
};

export default researchdbSpringerSearchToolSpec;
