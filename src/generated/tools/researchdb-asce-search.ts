import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsceSearchToolSpec: ToolSpec = {
  name: "research_asce_search",
  description: "research_asce_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asce.search", args, runtime as any)
};

export default researchdbAsceSearchToolSpec;
