import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAiaaSearchToolSpec: ToolSpec = {
  name: "research_aiaa_search",
  description: "research_aiaa_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aiaa.search", args, runtime as any)
};

export default researchdbAiaaSearchToolSpec;
