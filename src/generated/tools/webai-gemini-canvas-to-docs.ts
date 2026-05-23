import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiCanvasToDocsToolSpec: ToolSpec = {
  name: "webai_gemini_canvas_to_docs",
  description: "webai_gemini_canvas_to_docs manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.canvas_to_docs", args, runtime as any)
};

export default webaiGeminiCanvasToDocsToolSpec;
