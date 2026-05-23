import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticaExportToolSpec: ToolSpec = {
  name: "research_optica_export",
  description: "research_optica_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.optica.export", args, runtime as any)
};

export default researchdbOpticaExportToolSpec;
