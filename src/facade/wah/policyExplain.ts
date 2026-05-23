import { objectSchema, scalar } from "../../utils/schema";
import { loadManifestsFrom } from "../../registry/manifest/loader";
import { CONSUMER_ERROR_CODES } from "../../consumer/errorCodes";
import { manifestIdForLegacyTool } from "../legacy/aliases";

export const wahPolicyExplainInput = objectSchema<{ manifest_id?: string; mcp_name?: string }>({
  manifest_id: scalar.string("Manifest id to explain"),
  mcp_name: scalar.string("Legacy or wah MCP tool name to map and explain")
});

export async function wahPolicyExplain(args: { manifest_id?: string; mcp_name?: string }): Promise<unknown> {
  const manifestId = args.manifest_id || (args.mcp_name ? manifestIdForLegacyTool(args.mcp_name) : undefined);
  if (!manifestId) return { ok: false, errorCode: "INVALID_ARGS", message: "manifest_id or mcp_name is required" };
  const { manifests } = loadManifestsFrom(process.cwd() + "/configs/adapters");
  const manifest = manifests.find((m) => m.id === manifestId);
  if (!manifest) return { ok: false, errorCode: "INVALID_ARGS", manifest_id: manifestId, message: "manifest not found" };
  return { ok: true, manifest_id: manifest.id, operation: manifest.operation, safety: manifest.safety, maturity: manifest.maturity, preconditions: manifest.preconditions || [], possible_error_codes: [...CONSUMER_ERROR_CODES].filter((code) => ["INVALID_ARGS", "POLICY_APPROVAL_REQUIRED", "UI_DRIFT_DETECTED", "HEAL_CONFIDENCE_LOW", "HUMAN_HANDOFF_REQUIRED"].includes(code)) };
}
