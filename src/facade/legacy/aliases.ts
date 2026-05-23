import { ExecutionEngine, ExecutionRuntime, RunResult } from "../../runtime/exec/engine";

export function manifestIdForLegacyTool(mcpName: string): string {
  if (mcpName === "consumer_health") return "meta.consumer.health";
  if (mcpName === "research_inventory_import") return "meta.research_inventory.import";
  if (mcpName.startsWith("research_")) {
    const parts = mcpName.replace(/^research_/, "").split("_");
    const operation = parts.pop() || "run";
    return `researchdb.${parts.join("_")}.${operation}`;
  }
  if (mcpName.startsWith("webai_")) {
    const parts = mcpName.replace(/^webai_/, "").split("_");
    const provider = parts.shift() || "generic";
    return `webai.${provider}.${parts.join("_") || "run"}`;
  }
  return `legacy.${mcpName.replace(/_/g, ".")}`;
}

export async function runLegacyAlias(mcpName: string, args: Record<string, unknown>, runtime?: ExecutionRuntime): Promise<RunResult> {
  return ExecutionEngine.run(manifestIdForLegacyTool(mcpName), args, runtime || {});
}
