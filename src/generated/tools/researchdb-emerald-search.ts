import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbEmeraldSearchToolSpec: ToolSpec = {
  name: "research_emerald_search",
  description: "research_emerald_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.emerald.search", args, runtime as any)
};

export default researchdbEmeraldSearchToolSpec;
