import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAcsExportToolSpec: ToolSpec = {
  name: "research_acs_export",
  description: "research_acs_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.acs.export", args, runtime as any)
};

export default researchdbAcsExportToolSpec;
