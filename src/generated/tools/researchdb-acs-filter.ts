import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcsFilterToolSpec: ToolSpec = {
  name: "research_acs_filter",
  description: "research_acs_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acs.filter", args, runtime as any)
};

export default researchdbAcsFilterToolSpec;
