import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSaeSearchToolSpec: ToolSpec = {
  name: "research_sae_search",
  description: "research_sae_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sae.search", args, runtime as any)
};

export default researchdbSaeSearchToolSpec;
