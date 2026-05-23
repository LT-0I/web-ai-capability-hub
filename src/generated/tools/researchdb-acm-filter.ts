import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcmFilterToolSpec: ToolSpec = {
  name: "research_acm_filter",
  description: "research_acm_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acm.filter", args, runtime as any)
};

export default researchdbAcmFilterToolSpec;
