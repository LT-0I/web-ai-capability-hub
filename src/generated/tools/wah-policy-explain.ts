import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahPolicyExplainToolSpec: ToolSpec = {
  name: "wah_policy_explain",
  description: "Explain the policy, safety class, approvals, and stable error codes for a capability.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.policy.explain", args, runtime as any)
};

export default wahPolicyExplainToolSpec;
