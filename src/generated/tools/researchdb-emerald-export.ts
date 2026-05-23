import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbEmeraldExportToolSpec: ToolSpec = {
  name: "research_emerald_export",
  description: "research_emerald_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.emerald.export", args, runtime as any)
};

export default researchdbEmeraldExportToolSpec;
