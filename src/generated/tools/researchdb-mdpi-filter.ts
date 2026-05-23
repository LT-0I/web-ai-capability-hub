import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbMdpiFilterToolSpec: ToolSpec = {
  name: "research_mdpi_filter",
  description: "research_mdpi_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.mdpi.filter", args, runtime as any)
};

export default researchdbMdpiFilterToolSpec;
