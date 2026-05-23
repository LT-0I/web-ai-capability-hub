import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiDeepResearchToolSpec: ToolSpec = {
  name: "webai_gemini_deep_research",
  description: "webai_gemini_deep_research manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.deep_research", args, runtime as any)
};

export default webaiGeminiDeepResearchToolSpec;
