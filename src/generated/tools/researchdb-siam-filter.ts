import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSiamFilterToolSpec: ToolSpec = {
  name: "research_siam_filter",
  description: "research_siam_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.siam.filter", args, runtime as any)
};

export default researchdbSiamFilterToolSpec;
