import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIeeeExportToolSpec: ToolSpec = {
  name: "research_ieee_export",
  description: "research_ieee_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.ieee.export", args, runtime as any)
};

export default researchdbIeeeExportToolSpec;
