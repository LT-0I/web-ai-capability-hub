import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbRoyalsocFilterToolSpec: ToolSpec = {
  name: "research_royalsoc_filter",
  description: "research_royalsoc_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.royalsoc.filter", args, runtime as any)
};

export default researchdbRoyalsocFilterToolSpec;
