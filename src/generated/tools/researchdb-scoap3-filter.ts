import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbScoap3FilterToolSpec: ToolSpec = {
  name: "research_scoap3_filter",
  description: "research_scoap3_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.scoap3.filter", args, runtime as any)
};

export default researchdbScoap3FilterToolSpec;
