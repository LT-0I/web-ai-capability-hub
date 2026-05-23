import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const wahArtifactGetToolSpec: ToolSpec = {
  name: "wah_artifact_get",
  description: "Read redacted metadata for a persisted run artifact by id or path.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("wah.artifact.get", args, runtime as any)
};

export default wahArtifactGetToolSpec;
