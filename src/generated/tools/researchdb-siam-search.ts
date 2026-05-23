import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSiamSearchToolSpec: ToolSpec = {
  name: "research_siam_search",
  description: "research_siam_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.siam.search", args, runtime as any)
};

export default researchdbSiamSearchToolSpec;
