import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWorldsciSearchToolSpec: ToolSpec = {
  name: "research_worldsci_search",
  description: "research_worldsci_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.worldsci.search", args, runtime as any)
};

export default researchdbWorldsciSearchToolSpec;
