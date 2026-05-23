import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptDeepResearchToolSpec: ToolSpec = {
  name: "webai_chatgpt_deep_research",
  description: "webai_chatgpt_deep_research manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.deep_research", args, runtime as any)
};

export default webaiChatgptDeepResearchToolSpec;
