import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbFrontiersExportToolSpec: ToolSpec = {
  name: "research_frontiers_export",
  description: "research_frontiers_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.frontiers.export", args, runtime as any)
};

export default researchdbFrontiersExportToolSpec;
