import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWosSearchToolSpec: ToolSpec = {
  name: "research_wos_search",
  description: "research_wos_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wos.search", args, runtime as any)
};

export default researchdbWosSearchToolSpec;
