import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAsmeExportToolSpec: ToolSpec = {
  name: "research_asme_export",
  description: "research_asme_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.asme.export", args, runtime as any)
};

export default researchdbAsmeExportToolSpec;
