import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbTandfFilterToolSpec: ToolSpec = {
  name: "research_tandf_filter",
  description: "research_tandf_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.tandf.filter", args, runtime as any)
};

export default researchdbTandfFilterToolSpec;
