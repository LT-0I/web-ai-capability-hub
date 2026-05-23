import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeDesignPresentToolSpec: ToolSpec = {
  name: "webai_claude_design_present",
  description: "webai_claude_design_present manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.design_present", args, runtime as any)
};

export default webaiClaudeDesignPresentToolSpec;
