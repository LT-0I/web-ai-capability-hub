import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsceFilterToolSpec: ToolSpec = {
  name: "research_asce_filter",
  description: "research_asce_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asce.filter", args, runtime as any)
};

export default researchdbAsceFilterToolSpec;
