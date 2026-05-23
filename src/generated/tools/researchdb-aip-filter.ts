import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbAipFilterToolSpec: ToolSpec = {
  name: "research_aip_filter",
  description: "research_aip_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.aip.filter", args, runtime as any)
};

export default researchdbAipFilterToolSpec;
