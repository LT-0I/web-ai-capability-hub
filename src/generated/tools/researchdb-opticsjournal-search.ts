import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbOpticsjournalSearchToolSpec: ToolSpec = {
  name: "research_opticsjournal_search",
  description: "research_opticsjournal_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.opticsjournal.search", args, runtime as any)
};

export default researchdbOpticsjournalSearchToolSpec;
