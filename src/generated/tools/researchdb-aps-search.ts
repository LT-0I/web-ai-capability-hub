import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbApsSearchToolSpec: ToolSpec = {
  name: "research_aps_search",
  description: "research_aps_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aps.search", args, runtime as any)
};

export default researchdbApsSearchToolSpec;
