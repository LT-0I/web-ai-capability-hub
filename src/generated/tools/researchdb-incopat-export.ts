import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIncopatExportToolSpec: ToolSpec = {
  name: "research_incopat_export",
  description: "research_incopat_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.incopat.export", args, runtime as any)
};

export default researchdbIncopatExportToolSpec;
