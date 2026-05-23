import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiMusicTaskStatusToolSpec: ToolSpec = {
  name: "webai_gemini_music_task_status",
  description: "webai_gemini_music_task_status manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.music_task_status", args, runtime as any)
};

export default webaiGeminiMusicTaskStatusToolSpec;
