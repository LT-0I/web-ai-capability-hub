import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsceExportToolSpec: ToolSpec = {
  name: "research_asce_export",
  description: "research_asce_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asce.export", args, runtime as any)
};

export default researchdbAsceExportToolSpec;
