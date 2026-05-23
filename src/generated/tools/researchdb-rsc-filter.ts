import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbRscFilterToolSpec: ToolSpec = {
  name: "research_rsc_filter",
  description: "research_rsc_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.rsc.filter", args, runtime as any)
};

export default researchdbRscFilterToolSpec;
