import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticaFilterToolSpec: ToolSpec = {
  name: "research_optica_filter",
  description: "research_optica_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.optica.filter", args, runtime as any)
};

export default researchdbOpticaFilterToolSpec;
