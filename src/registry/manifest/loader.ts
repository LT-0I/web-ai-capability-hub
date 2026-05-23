const fs = require("node:fs");
const path = require("node:path");
import { CapabilityManifest, parseManifest } from "./schema";

export interface ManifestError {
  path: string;
  errors: string[];
}

export interface LoadManifestResult {
  manifests: CapabilityManifest[];
  errors: ManifestError[];
}

function walkYaml(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkYaml(full));
    else if (/\.ya?ml$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function looksLikeCapabilityManifest(raw: string): boolean {
  return /(^|\n)\s*version\s*:/m.test(raw) && /(^|\n)\s*operation\s*:/m.test(raw) && /(^|\n)\s*kind\s*:/m.test(raw) && /(^|\n)\s*descriptionLiteral\s*:/m.test(raw);
}

export function loadManifestsFrom(dir: string): LoadManifestResult {
  const manifests: CapabilityManifest[] = [];
  const errors: ManifestError[] = [];
  for (const file of walkYaml(dir)) {
    const raw = fs.readFileSync(file, "utf8");
    // configs/adapters historically also contains adapter-descriptor YAML/JSON. P1 manifests live in subdirs
    // and carry the manifest-only fields; legacy adapter descriptors are skipped rather than misreported.
    if (!looksLikeCapabilityManifest(raw)) continue;
    const parsed = parseManifest(raw);
    if (parsed.ok && parsed.manifest) manifests.push(parsed.manifest);
    else errors.push({ path: file, errors: parsed.errors });
  }
  return { manifests, errors };
}
