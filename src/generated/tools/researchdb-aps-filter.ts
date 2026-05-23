import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbApsFilterToolSpec: ToolSpec = {
  name: "research_aps_filter",
  description: "research_aps_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aps.filter", args, runtime as any)
};

export default researchdbApsFilterToolSpec;
