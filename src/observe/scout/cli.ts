import { readHtmlSnapshotFromFile } from "../../reader/snapshot";
import { mapFeatureFrontier } from "./frontier";
import { runProbeDsl } from "./prober";

export interface WahScoutCliOptions { target: string; fixture?: string; feature?: string; url?: string; notes?: string; save?: boolean; }

export async function runWahScout(options: WahScoutCliOptions): Promise<unknown> {
  if (!options.target) throw new Error("wah scout requires --target <id>");
  if (options.feature) return runProbeDsl(options.target, options.feature);
  if (!options.fixture) throw new Error("wah scout requires --fixture <html> unless --feature is supplied");
  const snapshot = readHtmlSnapshotFromFile(options.fixture);
  return mapFeatureFrontier(options.target, snapshot, { notes: options.notes, save: options.save, probeUrls: options.url ? [options.url] : [] });
}
