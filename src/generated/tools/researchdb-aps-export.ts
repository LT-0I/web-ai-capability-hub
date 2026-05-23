import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbApsExportToolSpec: ToolSpec = {
  name: "research_aps_export",
  description: "research_aps_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aps.export", args, runtime as any)
};

export default researchdbApsExportToolSpec;
