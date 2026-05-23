import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeDeepResearchToolSpec: ToolSpec = {
  name: "webai_claude_deep_research",
  description: "webai_claude_deep_research manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.deep_research", args, runtime as any)
};

export default webaiClaudeDeepResearchToolSpec;
