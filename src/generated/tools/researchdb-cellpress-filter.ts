import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCellpressFilterToolSpec: ToolSpec = {
  name: "research_cellpress_filter",
  description: "research_cellpress_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cellpress.filter", args, runtime as any)
};

export default researchdbCellpressFilterToolSpec;
