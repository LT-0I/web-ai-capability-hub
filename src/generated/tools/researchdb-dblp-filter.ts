import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDblpFilterToolSpec: ToolSpec = {
  name: "research_dblp_filter",
  description: "research_dblp_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.dblp.filter", args, runtime as any)
};

export default researchdbDblpFilterToolSpec;
