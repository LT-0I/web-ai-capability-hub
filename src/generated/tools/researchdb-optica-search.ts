import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticaSearchToolSpec: ToolSpec = {
  name: "research_optica_search",
  description: "research_optica_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.optica.search", args, runtime as any)
};

export default researchdbOpticaSearchToolSpec;
