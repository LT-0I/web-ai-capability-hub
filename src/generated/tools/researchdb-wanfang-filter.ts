import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWanfangFilterToolSpec: ToolSpec = {
  name: "research_wanfang_filter",
  description: "research_wanfang_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wanfang.filter", args, runtime as any)
};

export default researchdbWanfangFilterToolSpec;
