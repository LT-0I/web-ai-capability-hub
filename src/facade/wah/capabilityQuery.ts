import { objectSchema, scalar } from "../../utils/schema";
import { CapabilityDatabase } from "../../capabilities/database";
import { loadManifestsFrom } from "../../registry/manifest/loader";

export const wahCapabilityQueryInput = objectSchema<{ target?: string; text?: string; operation?: string; limit?: number }>({
  target: scalar.string("Target/provider id to filter manifests and capabilities"),
  text: scalar.string("Search text for manifest descriptions and capability records"),
  operation: scalar.string("Operation name such as search, filter, export, task_start"),
  limit: scalar.number("Maximum results")
});

export async function wahCapabilityQuery(args: { target?: string; text?: string; operation?: string; limit?: number }, runtime?: any): Promise<unknown> {
  const limit = args.limit || 20;
  const db = runtime?.database || new CapabilityDatabase();
  const { manifests, errors } = loadManifestsFrom(process.cwd() + "/configs/adapters");
  const needle = (args.text || "").toLowerCase();
  const manifestMatches = manifests
    .filter((m) => !args.target || m.target.provider === args.target || m.target.kind === args.target)
    .filter((m) => !args.operation || m.operation === args.operation)
    .filter((m) => !needle || `${m.id} ${m.descriptionLiteral}`.toLowerCase().includes(needle))
    .slice(0, limit)
    .map((m) => ({ id: m.id, target: m.target, operation: m.operation, maturity: m.maturity, safety: m.safety, description: m.descriptionLiteral }));
  const capabilities = db.queryCapabilities({ target: args.target, text: args.text, limit }).map((capability) => ({ target_id: capability.target_id, name: capability.name, category: capability.category, status: capability.status, confidence: capability.confidence }));
  return { ok: true, manifests: manifestMatches, capabilities, manifest_errors: errors.length };
}
