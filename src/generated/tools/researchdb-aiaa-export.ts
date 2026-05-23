import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAiaaExportToolSpec: ToolSpec = {
  name: "research_aiaa_export",
  description: "research_aiaa_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aiaa.export", args, runtime as any)
};

export default researchdbAiaaExportToolSpec;
