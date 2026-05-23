import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCellpressExportToolSpec: ToolSpec = {
  name: "research_cellpress_export",
  description: "research_cellpress_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cellpress.export", args, runtime as any)
};

export default researchdbCellpressExportToolSpec;
