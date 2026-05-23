import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiCanvasEditToolSpec: ToolSpec = {
  name: "webai_gemini_canvas_edit",
  description: "webai_gemini_canvas_edit manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.canvas_edit", args, runtime as any)
};

export default webaiGeminiCanvasEditToolSpec;
