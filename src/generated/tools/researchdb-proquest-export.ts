import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbProquestExportToolSpec: ToolSpec = {
  name: "research_proquest_export",
  description: "research_proquest_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.proquest.export", args, runtime as any)
};

export default researchdbProquestExportToolSpec;
