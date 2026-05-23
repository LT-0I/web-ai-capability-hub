import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbWorldsciExportToolSpec: ToolSpec = {
  name: "research_worldsci_export",
  description: "research_worldsci_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.worldsci.export", args, runtime as any)
};

export default researchdbWorldsciExportToolSpec;
