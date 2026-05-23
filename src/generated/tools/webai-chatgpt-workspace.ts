import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptWorkspaceToolSpec: ToolSpec = {
  name: "webai_chatgpt_workspace",
  description: "webai_chatgpt_workspace manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.workspace", args, runtime as any)
};

export default webaiChatgptWorkspaceToolSpec;
