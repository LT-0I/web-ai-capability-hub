import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeDesignGenerateToolSpec: ToolSpec = {
  name: "webai_claude_design_generate",
  description: "webai_claude_design_generate manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.design_generate", args, runtime as any)
};

export default webaiClaudeDesignGenerateToolSpec;
