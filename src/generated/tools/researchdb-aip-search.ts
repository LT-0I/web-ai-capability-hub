import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAipSearchToolSpec: ToolSpec = {
  name: "research_aip_search",
  description: "research_aip_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aip.search", args, runtime as any)
};

export default researchdbAipSearchToolSpec;
