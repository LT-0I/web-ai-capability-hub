import { objectSchema, scalar } from "../../utils/schema";
import { loadManifestsFrom } from "../../registry/manifest/loader";

export const wahAdapterHealthInput = objectSchema<{ provider?: string; kind?: string }>({
  provider: scalar.string("Provider id such as chatgpt, wos, acm, wah"),
  kind: scalar.string("Manifest target kind: webai, researchdb, generic")
});

export async function wahAdapterHealth(args: { provider?: string; kind?: string } = {}): Promise<unknown> {
  const { manifests, errors } = loadManifestsFrom(process.cwd() + "/configs/adapters");
  const selected = manifests.filter((m) => (!args.provider || m.target.provider === args.provider) && (!args.kind || m.target.kind === args.kind));
  const byKind = selected.reduce((acc: Record<string, number>, manifest) => { acc[manifest.target.kind] = (acc[manifest.target.kind] || 0) + 1; return acc; }, {});
  return { ok: errors.length === 0, provider: args.provider || null, kind: args.kind || null, manifest_count: selected.length, by_kind: byKind, errors };
}
