import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbProquestSearchToolSpec: ToolSpec = {
  name: "research_proquest_search",
  description: "research_proquest_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.proquest.search", args, runtime as any)
};

export default researchdbProquestSearchToolSpec;
