import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIeeeSearchToolSpec: ToolSpec = {
  name: "research_ieee_search",
  description: "research_ieee_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.ieee.search", args, runtime as any)
};

export default researchdbIeeeSearchToolSpec;
