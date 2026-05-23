import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptCodexGetDiffToolSpec: ToolSpec = {
  name: "webai_chatgpt_codex_get_diff",
  description: "webai_chatgpt_codex_get_diff manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.codex_get_diff", args, runtime as any)
};

export default webaiChatgptCodexGetDiffToolSpec;
