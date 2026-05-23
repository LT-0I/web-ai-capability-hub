import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbRoyalsocSearchToolSpec: ToolSpec = {
  name: "research_royalsoc_search",
  description: "research_royalsoc_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.royalsoc.search", args, runtime as any)
};

export default researchdbRoyalsocSearchToolSpec;
