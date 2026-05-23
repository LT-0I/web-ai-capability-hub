import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbSciencedirectFilterToolSpec: ToolSpec = {
  name: "research_sciencedirect_filter",
  description: "research_sciencedirect_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.sciencedirect.filter", args, runtime as any)
};

export default researchdbSciencedirectFilterToolSpec;
