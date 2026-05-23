import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAiaaFilterToolSpec: ToolSpec = {
  name: "research_aiaa_filter",
  description: "research_aiaa_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aiaa.filter", args, runtime as any)
};

export default researchdbAiaaFilterToolSpec;
