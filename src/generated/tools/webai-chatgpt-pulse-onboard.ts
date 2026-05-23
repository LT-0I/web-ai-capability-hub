import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptPulseOnboardToolSpec: ToolSpec = {
  name: "webai_chatgpt_pulse_onboard",
  description: "webai_chatgpt_pulse_onboard manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.pulse_onboard", args, runtime as any)
};

export default webaiChatgptPulseOnboardToolSpec;
