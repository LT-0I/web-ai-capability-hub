import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCambridgeSearchToolSpec: ToolSpec = {
  name: "research_cambridge_search",
  description: "research_cambridge_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cambridge.search", args, runtime as any)
};

export default researchdbCambridgeSearchToolSpec;
