import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIetSearchToolSpec: ToolSpec = {
  name: "research_iet_search",
  description: "research_iet_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iet.search", args, runtime as any)
};

export default researchdbIetSearchToolSpec;
