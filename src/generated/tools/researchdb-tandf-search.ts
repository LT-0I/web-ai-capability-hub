import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbTandfSearchToolSpec: ToolSpec = {
  name: "research_tandf_search",
  description: "research_tandf_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.tandf.search", args, runtime as any)
};

export default researchdbTandfSearchToolSpec;
