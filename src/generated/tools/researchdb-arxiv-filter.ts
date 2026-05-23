import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbArxivFilterToolSpec: ToolSpec = {
  name: "research_arxiv_filter",
  description: "research_arxiv_filter manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.arxiv.filter", args, runtime as any)
};

export default researchdbArxivFilterToolSpec;
