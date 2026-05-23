import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCellpressSearchToolSpec: ToolSpec = {
  name: "research_cellpress_search",
  description: "research_cellpress_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.cellpress.search", args, runtime as any)
};

export default researchdbCellpressSearchToolSpec;
