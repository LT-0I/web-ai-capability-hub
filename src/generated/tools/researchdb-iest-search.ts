import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIestSearchToolSpec: ToolSpec = {
  name: "research_iest_search",
  description: "research_iest_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iest.search", args, runtime as any)
};

export default researchdbIestSearchToolSpec;
