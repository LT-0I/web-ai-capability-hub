import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCrcExportToolSpec: ToolSpec = {
  name: "research_crc_export",
  description: "research_crc_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.crc.export", args, runtime as any)
};

export default researchdbCrcExportToolSpec;
