import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbScoap3ExportToolSpec: ToolSpec = {
  name: "research_scoap3_export",
  description: "research_scoap3_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.scoap3.export", args, runtime as any)
};

export default researchdbScoap3ExportToolSpec;
