import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeGenerateFileToolSpec: ToolSpec = {
  name: "webai_claude_generate_file",
  description: "webai_claude_generate_file manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.generate_file", args, runtime as any)
};

export default webaiClaudeGenerateFileToolSpec;
