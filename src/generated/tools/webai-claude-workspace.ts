import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeWorkspaceToolSpec: ToolSpec = {
  name: "webai_claude_workspace",
  description: "webai_claude_workspace manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.workspace", args, runtime as any)
};

export default webaiClaudeWorkspaceToolSpec;
