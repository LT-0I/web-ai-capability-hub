const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml") as { load(input: string): any };
import { probeUrl, ProbeResult } from "../../maintenance/probe";

export interface ProbeDslStep { url: string; expect?: string; timeoutMs?: number; }
export interface ProbeDsl { target?: string; feature?: string; probes?: ProbeDslStep[]; }
export interface ProbeDslResult { file: string; target: string; feature: string; results: ProbeResult[]; ok: boolean; }

export function probeFileFor(target: string, feature: string, root = process.cwd()): string {
  return path.resolve(root, "probes", target, `${feature}.yaml`);
}

export async function runProbeDsl(target: string, feature: string, root = process.cwd()): Promise<ProbeDslResult> {
  const file = probeFileFor(target, feature, root);
  if (!fs.existsSync(file)) throw new Error(`Probe DSL file not found: ${file}`);
  const parsed = yaml.load(fs.readFileSync(file, "utf8")) as ProbeDsl;
  const probes = Array.isArray(parsed.probes) ? parsed.probes : [];
  const results: ProbeResult[] = [];
  for (const step of probes) {
    if (!step?.url) continue;
    results.push(await probeUrl(step.url, { timeoutMs: step.timeoutMs }));
  }
  return { file, target: parsed.target || target, feature: parsed.feature || feature, results, ok: results.every((result) => result.status === "reachable" || result.status === "reachable_login_wall") };
}
