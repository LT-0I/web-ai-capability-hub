import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptGenerateImageToolSpec: ToolSpec = {
  name: "webai_chatgpt_generate_image",
  description: "webai_chatgpt_generate_image manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.generate_image", args, runtime as any)
};

export default webaiChatgptGenerateImageToolSpec;
