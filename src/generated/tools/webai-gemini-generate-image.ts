import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiGenerateImageToolSpec: ToolSpec = {
  name: "webai_gemini_generate_image",
  description: "webai_gemini_generate_image manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.generate_image", args, runtime as any)
};

export default webaiGeminiGenerateImageToolSpec;
