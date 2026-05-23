import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticsjournalExportToolSpec: ToolSpec = {
  name: "research_opticsjournal_export",
  description: "research_opticsjournal_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.opticsjournal.export", args, runtime as any)
};

export default researchdbOpticsjournalExportToolSpec;
