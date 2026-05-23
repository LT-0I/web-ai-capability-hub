import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSaeFilterToolSpec: ToolSpec = {
  name: "research_sae_filter",
  description: "research_sae_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sae.filter", args, runtime as any)
};

export default researchdbSaeFilterToolSpec;
