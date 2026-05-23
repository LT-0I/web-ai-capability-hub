import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIopFilterToolSpec: ToolSpec = {
  name: "research_iop_filter",
  description: "research_iop_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iop.filter", args, runtime as any)
};

export default researchdbIopFilterToolSpec;
