import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeSelectModelToolSpec: ToolSpec = {
  name: "webai_claude_select_model",
  description: "webai_claude_select_model manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.select_model", args, runtime as any)
};

export default webaiClaudeSelectModelToolSpec;
