import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const webaiClaudeDesignCreateProjectToolSpec: ToolSpec = {
  name: "webai_claude_design_create_project",
  description: "webai_claude_design_create_project manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("webai.claude.design_create_project", args, runtime as any)
};

export default webaiClaudeDesignCreateProjectToolSpec;
