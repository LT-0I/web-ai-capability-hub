import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWosFilterToolSpec: ToolSpec = {
  name: "research_wos_filter",
  description: "research_wos_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wos.filter", args, runtime as any)
};

export default researchdbWosFilterToolSpec;
