import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbArxivSearchToolSpec: ToolSpec = {
  name: "research_arxiv_search",
  description: "research_arxiv_search manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.arxiv.search", args, runtime as any)
};

export default researchdbArxivSearchToolSpec;
