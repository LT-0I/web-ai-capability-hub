import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSpringerExportToolSpec: ToolSpec = {
  name: "research_springer_export",
  description: "research_springer_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.springer.export", args, runtime as any)
};

export default researchdbSpringerExportToolSpec;
