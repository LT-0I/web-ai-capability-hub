import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbCrcFilterToolSpec: ToolSpec = {
  name: "research_crc_filter",
  description: "research_crc_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.crc.filter", args, runtime as any)
};

export default researchdbCrcFilterToolSpec;
