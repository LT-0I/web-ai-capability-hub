import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeSendPromptToolSpec: ToolSpec = {
  name: "webai_claude_send_prompt",
  description: "webai_claude_send_prompt manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.send_prompt", args, runtime as any)
};

export default webaiClaudeSendPromptToolSpec;
