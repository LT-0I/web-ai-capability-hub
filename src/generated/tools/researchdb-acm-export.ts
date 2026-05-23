import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcmExportToolSpec: ToolSpec = {
  name: "research_acm_export",
  description: "research_acm_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acm.export", args, runtime as any)
};

export default researchdbAcmExportToolSpec;
