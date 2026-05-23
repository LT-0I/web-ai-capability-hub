import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWileyFilterToolSpec: ToolSpec = {
  name: "research_wiley_filter",
  description: "research_wiley_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wiley.filter", args, runtime as any)
};

export default researchdbWileyFilterToolSpec;
