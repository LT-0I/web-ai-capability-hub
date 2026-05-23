import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIetExportToolSpec: ToolSpec = {
  name: "research_iet_export",
  description: "research_iet_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iet.export", args, runtime as any)
};

export default researchdbIetExportToolSpec;
