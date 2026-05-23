import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcsSearchToolSpec: ToolSpec = {
  name: "research_acs_search",
  description: "research_acs_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acs.search", args, runtime as any)
};

export default researchdbAcsSearchToolSpec;
