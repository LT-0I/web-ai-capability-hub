import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbNatureFilterToolSpec: ToolSpec = {
  name: "research_nature_filter",
  description: "research_nature_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.nature.filter", args, runtime as any)
};

export default researchdbNatureFilterToolSpec;
