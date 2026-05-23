import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbProquestFilterToolSpec: ToolSpec = {
  name: "research_proquest_filter",
  description: "research_proquest_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.proquest.filter", args, runtime as any)
};

export default researchdbProquestFilterToolSpec;
