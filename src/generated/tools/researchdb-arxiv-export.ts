import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const researchdbArxivExportToolSpec: ToolSpec = {
  name: "research_arxiv_export",
  description: "research_arxiv_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("researchdb.arxiv.export", args, runtime as any)
};

export default researchdbArxivExportToolSpec;
