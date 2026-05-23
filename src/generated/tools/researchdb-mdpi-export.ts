import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbMdpiExportToolSpec: ToolSpec = {
  name: "research_mdpi_export",
  description: "research_mdpi_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.mdpi.export", args, runtime as any)
};

export default researchdbMdpiExportToolSpec;
