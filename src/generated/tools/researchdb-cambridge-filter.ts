import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCambridgeFilterToolSpec: ToolSpec = {
  name: "research_cambridge_filter",
  description: "research_cambridge_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cambridge.filter", args, runtime as any)
};

export default researchdbCambridgeFilterToolSpec;
