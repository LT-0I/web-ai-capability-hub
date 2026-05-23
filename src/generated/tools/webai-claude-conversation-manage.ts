import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeConversationManageToolSpec: ToolSpec = {
  name: "webai_claude_conversation_manage",
  description: "webai_claude_conversation_manage manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.conversation_manage", args, runtime as any)
};

export default webaiClaudeConversationManageToolSpec;
