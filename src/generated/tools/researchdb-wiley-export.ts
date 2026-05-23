import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWileyExportToolSpec: ToolSpec = {
  name: "research_wiley_export",
  description: "research_wiley_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wiley.export", args, runtime as any)
};

export default researchdbWileyExportToolSpec;
