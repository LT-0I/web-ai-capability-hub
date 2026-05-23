import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWosExportToolSpec: ToolSpec = {
  name: "research_wos_export",
  description: "research_wos_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wos.export", args, runtime as any)
};

export default researchdbWosExportToolSpec;
