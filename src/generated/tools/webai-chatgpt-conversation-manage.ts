import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptConversationManageToolSpec: ToolSpec = {
  name: "webai_chatgpt_conversation_manage",
  description: "webai_chatgpt_conversation_manage manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.conversation_manage", args, runtime as any)
};

export default webaiChatgptConversationManageToolSpec;
