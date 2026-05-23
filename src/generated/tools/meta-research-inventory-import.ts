import { objectSchema } from "../../utils/schema";
import { ToolSpec } from "../../mcp/tools";
import { ExecutionEngine } from "../../runtime/exec/engine";

export const metaResearchInventoryImportToolSpec: ToolSpec = {
  name: "meta_research_inventory_import",
  description: "research_inventory_import manifest-backed tool.",
  schema: objectSchema<Record<string, unknown>>({}, []),
  handler: async (args, runtime) => ExecutionEngine.run("meta.research_inventory.import", args, runtime as any)
};

export default metaResearchInventoryImportToolSpec;
