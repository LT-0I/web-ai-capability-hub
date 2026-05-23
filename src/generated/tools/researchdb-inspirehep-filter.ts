import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbInspirehepFilterToolSpec: ToolSpec = {
  name: "research_inspirehep_filter",
  description: "research_inspirehep_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.inspirehep.filter", args, runtime as any)
};

export default researchdbInspirehepFilterToolSpec;
