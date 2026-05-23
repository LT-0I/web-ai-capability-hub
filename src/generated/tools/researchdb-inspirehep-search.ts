import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbInspirehepSearchToolSpec: ToolSpec = {
  name: "research_inspirehep_search",
  description: "research_inspirehep_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.inspirehep.search", args, runtime as any)
};

export default researchdbInspirehepSearchToolSpec;
