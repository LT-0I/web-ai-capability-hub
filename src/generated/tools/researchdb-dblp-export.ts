import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDblpExportToolSpec: ToolSpec = {
  name: "research_dblp_export",
  description: "research_dblp_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.dblp.export", args, runtime as any)
};

export default researchdbDblpExportToolSpec;
