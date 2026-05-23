import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIncopatFilterToolSpec: ToolSpec = {
  name: "research_incopat_filter",
  description: "research_incopat_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.incopat.filter", args, runtime as any)
};

export default researchdbIncopatFilterToolSpec;
