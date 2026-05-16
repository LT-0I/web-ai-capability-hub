import { CapabilityDatabase } from "../capabilities/database";
import { assertNoForbidden, stripForbidden } from "./forbiddenFields";

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
  let result: unknown;
  if (uri === "capabilities://targets") result = exported.service_targets;
  else if (uri.startsWith("capabilities://target/") && uri.endsWith("/latest")) {
    const targetId = uri.replace("capabilities://target/", "").replace("/latest", "");
    result = database.latestCapture(targetId);
  }
  else if (uri.startsWith("capabilities://target/")) {
    const targetId = uri.replace("capabilities://target/", "");
    result = exported.capabilities.filter((capability) => capability.target_id === targetId);
  }
  else if (uri === "workflows://definitions") result = exported.workflow_definitions;
  else if (uri === "workflows://runs") result = exported.workflow_runs;
  else if (uri === "browser-profiles://list") result = exported.browser_profiles;
  else if (uri === "site-registry://sites") result = exported.site_registry_entries;
  else if (uri === "capability-library://features") result = exported.integration_registry;
  else throw new Error(`Unknown MCP resource: ${uri}`);

  const safeResult = stripForbidden(result);
  assertNoForbidden(safeResult);
  return safeResult;
}
