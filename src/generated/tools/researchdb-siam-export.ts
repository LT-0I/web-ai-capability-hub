import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSiamExportToolSpec: ToolSpec = {
  name: "research_siam_export",
  description: "research_siam_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.siam.export", args, runtime as any)
};

export default researchdbSiamExportToolSpec;
