import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahCapabilityQueryToolSpec: ToolSpec = {
  name: "wah_capability_query",
  description: "Query manifest-backed capabilities and legacy tool aliases without exposing local browser internals.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.capability.query", args, runtime as any)
};

export default wahCapabilityQueryToolSpec;
