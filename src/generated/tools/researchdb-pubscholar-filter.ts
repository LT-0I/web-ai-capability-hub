import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbPubscholarFilterToolSpec: ToolSpec = {
  name: "research_pubscholar_filter",
  description: "research_pubscholar_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.pubscholar.filter", args, runtime as any)
};

export default researchdbPubscholarFilterToolSpec;
