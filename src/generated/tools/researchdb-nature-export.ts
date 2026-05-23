import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbNatureExportToolSpec: ToolSpec = {
  name: "research_nature_export",
  description: "research_nature_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.nature.export", args, runtime as any)
};

export default researchdbNatureExportToolSpec;
