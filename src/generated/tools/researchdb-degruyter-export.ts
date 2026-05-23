import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbDegruyterExportToolSpec: ToolSpec = {
  name: "research_degruyter_export",
  description: "research_degruyter_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.degruyter.export", args, runtime as any)
};

export default researchdbDegruyterExportToolSpec;
