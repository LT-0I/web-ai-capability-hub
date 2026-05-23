import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiGeminiWorkspaceToolSpec: ToolSpec = {
  name: "webai_gemini_workspace",
  description: "webai_gemini_workspace manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.gemini.workspace", args, runtime as any)
};

export default webaiGeminiWorkspaceToolSpec;
