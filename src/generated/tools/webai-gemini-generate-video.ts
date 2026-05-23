import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiGenerateVideoToolSpec: ToolSpec = {
  name: "webai_gemini_generate_video",
  description: "webai_gemini_generate_video manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.generate_video", args, runtime as any)
};

export default webaiGeminiGenerateVideoToolSpec;
