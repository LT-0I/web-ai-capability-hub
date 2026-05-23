import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptCodexListEnvsToolSpec: ToolSpec = {
  name: "webai_chatgpt_codex_list_envs",
  description: "webai_chatgpt_codex_list_envs manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.codex_list_envs", args, runtime as any)
};

export default webaiChatgptCodexListEnvsToolSpec;
