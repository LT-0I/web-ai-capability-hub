import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWanfangExportToolSpec: ToolSpec = {
  name: "research_wanfang_export",
  description: "research_wanfang_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.wanfang.export", args, runtime as any)
};

export default researchdbWanfangExportToolSpec;
