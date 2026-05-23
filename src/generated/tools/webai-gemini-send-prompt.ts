import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiSendPromptToolSpec: ToolSpec = {
  name: "webai_gemini_send_prompt",
  description: "webai_gemini_send_prompt manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.send_prompt", args, runtime as any)
};

export default webaiGeminiSendPromptToolSpec;
