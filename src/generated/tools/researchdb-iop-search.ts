import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIopSearchToolSpec: ToolSpec = {
  name: "research_iop_search",
  description: "research_iop_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iop.search", args, runtime as any)
};

export default researchdbIopSearchToolSpec;
