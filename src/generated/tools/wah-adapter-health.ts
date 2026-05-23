import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahAdapterHealthToolSpec: ToolSpec = {
  name: "wah_adapter_health",
  description: "Return adapter and manifest health for a provider, including generated-tool availability.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.adapter.health", args, runtime as any)
};

export default wahAdapterHealthToolSpec;
