import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticsjournalFilterToolSpec: ToolSpec = {
  name: "research_opticsjournal_filter",
  description: "research_opticsjournal_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.opticsjournal.filter", args, runtime as any)
};

export default researchdbOpticsjournalFilterToolSpec;
