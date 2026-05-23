import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIeeeFilterToolSpec: ToolSpec = {
  name: "research_ieee_filter",
  description: "research_ieee_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.ieee.filter", args, runtime as any)
};

export default researchdbIeeeFilterToolSpec;
