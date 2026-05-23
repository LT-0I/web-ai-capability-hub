import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptCodexTaskStatusToolSpec: ToolSpec = {
  name: "webai_chatgpt_codex_task_status",
  description: "webai_chatgpt_codex_task_status manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.codex_task_status", args, runtime as any)
};

export default webaiChatgptCodexTaskStatusToolSpec;
