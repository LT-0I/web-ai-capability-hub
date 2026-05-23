import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSaeExportToolSpec: ToolSpec = {
  name: "research_sae_export",
  description: "research_sae_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sae.export", args, runtime as any)
};

export default researchdbSaeExportToolSpec;
