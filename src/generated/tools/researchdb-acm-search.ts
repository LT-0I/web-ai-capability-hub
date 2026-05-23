import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcmSearchToolSpec: ToolSpec = {
  name: "research_acm_search",
  description: "research_acm_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acm.search", args, runtime as any)
};

export default researchdbAcmSearchToolSpec;
