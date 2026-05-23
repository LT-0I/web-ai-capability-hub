import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbIopExportToolSpec: ToolSpec = {
  name: "research_iop_export",
  description: "research_iop_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.iop.export", args, runtime as any)
};

export default researchdbIopExportToolSpec;
