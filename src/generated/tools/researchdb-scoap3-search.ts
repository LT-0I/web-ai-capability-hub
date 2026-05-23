import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbScoap3SearchToolSpec: ToolSpec = {
  name: "research_scoap3_search",
  description: "research_scoap3_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.scoap3.search", args, runtime as any)
};

export default researchdbScoap3SearchToolSpec;
