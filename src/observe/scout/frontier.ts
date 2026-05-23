import { PageSnapshot, SiteMap, SiteMapDiff } from "../../shared/types";
import { captureSiteMapForSnapshot, saveSiteMap } from "../../maintenance/captureSiteMap";
import { diffSiteMapFiles, latestSiteMapPath } from "../../maintenance/diffSiteMap";
import { probeUrl, ProbeResult } from "../../maintenance/probe";

export interface FeatureCoverage {
  feature: string;
  present: boolean;
  evidence: string[];
}

export interface ScoutFrontierResult {
  target: string;
  siteMap: SiteMap;
  savedPath?: string;
  previousPath?: string;
  diff?: SiteMapDiff;
  probes: ProbeResult[];
  coverage: FeatureCoverage[];
}

const TAXONOMY = ["search", "advanced search", "filter", "facet", "sort", "result", "citation", "export", "download", "login"];

function textCorpus(snapshot: PageSnapshot): string {
  return JSON.stringify({ title: snapshot.title, text: snapshot.visibleText, elements: snapshot.elements?.map((e: any) => ({ role: e.role, name: e.name, text: e.text })) }).toLowerCase();
}

export async function mapFeatureFrontier(target: string, snapshot: PageSnapshot, options: { notes?: string; save?: boolean; probeUrls?: string[] } = {}): Promise<ScoutFrontierResult> {
  const siteMap = captureSiteMapForSnapshot(target, snapshot, options.notes);
  const savedPath = options.save === false ? undefined : saveSiteMap(siteMap);
  const previousPath = latestSiteMapPath(target);
  const diff = previousPath && savedPath && previousPath !== savedPath ? diffSiteMapFiles(previousPath, savedPath) : undefined;
  const corpus = textCorpus(snapshot);
  const coverage = TAXONOMY.map((feature) => ({ feature, present: corpus.includes(feature), evidence: corpus.includes(feature) ? [feature] : [] }));
  const probes = [] as ProbeResult[];
  for (const url of options.probeUrls || []) probes.push(await probeUrl(url));
  return { target, siteMap, savedPath, previousPath, diff, probes, coverage };
}
