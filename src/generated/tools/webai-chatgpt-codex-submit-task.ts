import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptCodexSubmitTaskToolSpec: ToolSpec = {
  name: "webai_chatgpt_codex_submit_task",
  description: "webai_chatgpt_codex_submit_task manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.codex_submit_task", args, runtime as any)
};

export default webaiChatgptCodexSubmitTaskToolSpec;
