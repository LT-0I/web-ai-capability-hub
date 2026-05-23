import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsmeFilterToolSpec: ToolSpec = {
  name: "research_asme_filter",
  description: "research_asme_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asme.filter", args, runtime as any)
};

export default researchdbAsmeFilterToolSpec;
