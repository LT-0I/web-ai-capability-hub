import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsmeSearchToolSpec: ToolSpec = {
  name: "research_asme_search",
  description: "research_asme_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asme.search", args, runtime as any)
};

export default researchdbAsmeSearchToolSpec;
