import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbRscSearchToolSpec: ToolSpec = {
  name: "research_rsc_search",
  description: "research_rsc_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.rsc.search", args, runtime as any)
};

export default researchdbRscSearchToolSpec;
