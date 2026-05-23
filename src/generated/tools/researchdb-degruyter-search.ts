import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDegruyterSearchToolSpec: ToolSpec = {
  name: "research_degruyter_search",
  description: "research_degruyter_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.degruyter.search", args, runtime as any)
};

export default researchdbDegruyterSearchToolSpec;
