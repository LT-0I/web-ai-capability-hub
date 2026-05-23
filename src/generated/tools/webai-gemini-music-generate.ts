import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiMusicGenerateToolSpec: ToolSpec = {
  name: "webai_gemini_music_generate",
  description: "webai_gemini_music_generate manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.music_generate", args, runtime as any)
};

export default webaiGeminiMusicGenerateToolSpec;
