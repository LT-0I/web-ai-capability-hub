import { objectSchema, scalar } from "../../utils/schema";
import { CapabilityDatabase } from "../../capabilities/database";

export const wahArtifactGetInput = objectSchema<{ artifact_id?: string; path?: string }>({
  artifact_id: scalar.string("Artifact id"),
  path: scalar.string("Artifact path to match exactly")
});

export async function wahArtifactGet(args: { artifact_id?: string; path?: string }, runtime?: any): Promise<unknown> {
  if (!args.artifact_id && !args.path) return { ok: false, errorCode: "INVALID_ARGS", message: "artifact_id or path is required" };
  const db = runtime?.database || new CapabilityDatabase();
  const artifacts = db.exportJson().artifacts || [];
  const artifact = artifacts.find((item: any) => (args.artifact_id && item.id === args.artifact_id) || (args.path && item.path === args.path));
  if (!artifact) return { ok: false, errorCode: "INVALID_ARGS", message: "artifact not found" };
  return { ok: true, artifact: { id: artifact.id, target_id: artifact.target_id, capture_id: artifact.capture_id, kind: artifact.kind, created_at: artifact.created_at, metadata: artifact.metadata || {} } };
}
