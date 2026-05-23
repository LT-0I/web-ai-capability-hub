import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSciencedirectExportToolSpec: ToolSpec = {
  name: "research_sciencedirect_export",
  description: "research_sciencedirect_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sciencedirect.export", args, runtime as any)
};

export default researchdbSciencedirectExportToolSpec;
