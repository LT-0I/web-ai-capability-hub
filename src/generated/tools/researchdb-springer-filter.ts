import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSpringerFilterToolSpec: ToolSpec = {
  name: "research_springer_filter",
  description: "research_springer_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.springer.filter", args, runtime as any)
};

export default researchdbSpringerFilterToolSpec;
