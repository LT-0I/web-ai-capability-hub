import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiMusicDownloadTrackToolSpec: ToolSpec = {
  name: "webai_gemini_music_download_track",
  description: "webai_gemini_music_download_track manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.music_download_track", args, runtime as any)
};

export default webaiGeminiMusicDownloadTrackToolSpec;
