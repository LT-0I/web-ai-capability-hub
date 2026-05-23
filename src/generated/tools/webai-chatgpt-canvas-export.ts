import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiChatgptCanvasExportToolSpec: ToolSpec = {
  name: "webai_chatgpt_canvas_export",
  description: "webai_chatgpt_canvas_export manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.chatgpt.canvas_export", args, runtime as any)
};

export default webaiChatgptCanvasExportToolSpec;
