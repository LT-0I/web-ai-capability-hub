import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbTandfExportToolSpec: ToolSpec = {
  name: "research_tandf_export",
  description: "research_tandf_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.tandf.export", args, runtime as any)
};

export default researchdbTandfExportToolSpec;
