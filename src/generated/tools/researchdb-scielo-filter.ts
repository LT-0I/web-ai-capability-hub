import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbScieloFilterToolSpec: ToolSpec = {
  name: "research_scielo_filter",
  description: "research_scielo_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.scielo.filter", args, runtime as any)
};

export default researchdbScieloFilterToolSpec;
