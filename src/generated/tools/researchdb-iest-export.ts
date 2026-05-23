import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIestExportToolSpec: ToolSpec = {
  name: "research_iest_export",
  description: "research_iest_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iest.export", args, runtime as any)
};

export default researchdbIestExportToolSpec;
