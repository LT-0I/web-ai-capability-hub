import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCambridgeExportToolSpec: ToolSpec = {
  name: "research_cambridge_export",
  description: "research_cambridge_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cambridge.export", args, runtime as any)
};

export default researchdbCambridgeExportToolSpec;
