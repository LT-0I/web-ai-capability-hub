import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbPubscholarSearchToolSpec: ToolSpec = {
  name: "research_pubscholar_search",
  description: "research_pubscholar_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.pubscholar.search", args, runtime as any)
};

export default researchdbPubscholarSearchToolSpec;
