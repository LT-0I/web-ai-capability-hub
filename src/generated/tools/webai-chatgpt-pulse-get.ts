import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptPulseGetToolSpec: ToolSpec = {
  name: "webai_chatgpt_pulse_get",
  description: "webai_chatgpt_pulse_get manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.pulse_get", args, runtime as any)
};

export default webaiChatgptPulseGetToolSpec;
