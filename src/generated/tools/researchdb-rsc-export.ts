import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbRscExportToolSpec: ToolSpec = {
  name: "research_rsc_export",
  description: "research_rsc_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.rsc.export", args, runtime as any)
};

export default researchdbRscExportToolSpec;
