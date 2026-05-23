import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbInspirehepExportToolSpec: ToolSpec = {
  name: "research_inspirehep_export",
  description: "research_inspirehep_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.inspirehep.export", args, runtime as any)
};

export default researchdbInspirehepExportToolSpec;
