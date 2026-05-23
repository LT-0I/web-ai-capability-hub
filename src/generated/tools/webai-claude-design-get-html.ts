import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeDesignGetHtmlToolSpec: ToolSpec = {
  name: "webai_claude_design_get_html",
  description: "webai_claude_design_get_html manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.design_get_html", args, runtime as any)
};

export default webaiClaudeDesignGetHtmlToolSpec;
