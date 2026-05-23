import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCrcSearchToolSpec: ToolSpec = {
  name: "research_crc_search",
  description: "research_crc_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.crc.search", args, runtime as any)
};

export default researchdbCrcSearchToolSpec;
