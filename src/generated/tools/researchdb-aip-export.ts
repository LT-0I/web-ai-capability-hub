import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAipExportToolSpec: ToolSpec = {
  name: "research_aip_export",
  description: "research_aip_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aip.export", args, runtime as any)
};

export default researchdbAipExportToolSpec;
