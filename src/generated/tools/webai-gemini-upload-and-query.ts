import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiUploadAndQueryToolSpec: ToolSpec = {
  name: "webai_gemini_upload_and_query",
  description: "webai_gemini_upload_and_query manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.upload_and_query", args, runtime as any)
};

export default webaiGeminiUploadAndQueryToolSpec;
