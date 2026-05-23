import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptUploadAndQueryToolSpec: ToolSpec = {
  name: "webai_chatgpt_upload_and_query",
  description: "webai_chatgpt_upload_and_query manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.upload_and_query", args, runtime as any)
};

export default webaiChatgptUploadAndQueryToolSpec;
