import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWorldsciFilterToolSpec: ToolSpec = {
  name: "research_worldsci_filter",
  description: "research_worldsci_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.worldsci.filter", args, runtime as any)
};

export default researchdbWorldsciFilterToolSpec;
