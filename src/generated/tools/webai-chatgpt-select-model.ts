import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptSelectModelToolSpec: ToolSpec = {
  name: "webai_chatgpt_select_model",
  description: "webai_chatgpt_select_model manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.select_model", args, runtime as any)
};

export default webaiChatgptSelectModelToolSpec;
