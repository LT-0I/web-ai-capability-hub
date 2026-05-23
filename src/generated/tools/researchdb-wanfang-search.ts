import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWanfangSearchToolSpec: ToolSpec = {
  name: "research_wanfang_search",
  description: "research_wanfang_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wanfang.search", args, runtime as any)
};

export default researchdbWanfangSearchToolSpec;
