import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDegruyterFilterToolSpec: ToolSpec = {
  name: "research_degruyter_filter",
  description: "research_degruyter_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.degruyter.filter", args, runtime as any)
};

export default researchdbDegruyterFilterToolSpec;
