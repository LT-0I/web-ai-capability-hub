import { CapabilityDatabase } from "../capabilities/database";

export interface McpResourceDefinition { uri: string; name: string; description: string; mimeType: string; }

export function listMcpResources(): McpResourceDefinition[] {
  return [
    { uri: "capabilities://targets", name: "Capability targets", description: "List service/research targets in the local capability database.", mimeType: "application/json" },
    { uri: "capabilities://target/{targetId}", name: "Target capabilities", description: "Capability records for a target.", mimeType: "application/json" },
    { uri: "capabilities://target/{targetId}/latest", name: "Latest target capture", description: "Latest capture metadata for a target.", mimeType: "application/json" },
    { uri: "workflows://definitions", name: "Workflow definitions", description: "Stored workflow definitions.", mimeType: "application/json" },
    { uri: "workflows://runs", name: "Workflow runs", description: "Recorded workflow runs.", mimeType: "application/json" },
    { uri: "browser-profiles://list", name: "Browser profiles", description: "Managed browser profile metadata.", mimeType: "application/json" },
    { uri: "site-registry://sites", name: "Research site registry", description: "Imported research database registry entries.", mimeType: "application/json" },
    { uri: "capability-library://features", name: "Capability library features", description: "Imported integration governance feature registry entries.", mimeType: "application/json" }
  ];
}

export function readMcpResource(uri: string, database = new CapabilityDatabase()): unknown {
  const exported = database.exportJson();
  if (uri === "capabilities://targets") return exported.service_targets;
  if (uri.startsWith("capabilities://target/") && uri.endsWith("/latest")) {
    const targetId = uri.replace("capabilities://target/", "").replace("/latest", "");
    return database.latestCapture(targetId);
  }
  if (uri.startsWith("capabilities://target/")) {
    const targetId = uri.replace("capabilities://target/", "");
    return exported.capabilities.filter((capability) => capability.target_id === targetId);
  }
  if (uri === "workflows://definitions") return exported.workflow_definitions;
  if (uri === "workflows://runs") return exported.workflow_runs;
  if (uri === "browser-profiles://list") return exported.browser_profiles;
  if (uri === "site-registry://sites") return exported.site_registry_entries;
  if (uri === "capability-library://features") return exported.integration_registry;
  throw new Error(`Unknown MCP resource: ${uri}`);
}
