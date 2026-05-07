const fs = require("node:fs");
const path = require("node:path");
import { SiteMap, SiteMapDiff } from "../shared/types";
import { diffSiteMaps } from "../adapters/siteMap";
import { getStoragePaths, safeFilename } from "../utils/paths";

export function loadSiteMap(filePath: string): SiteMap {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function latestSiteMapPath(site: string, siteMapDir = getStoragePaths().siteMapDir): string | undefined {
  const siteDir = path.join(siteMapDir, safeFilename(site));
  const latest = path.join(siteDir, "latest.json");
  if (fs.existsSync(latest)) return latest;
  if (!fs.existsSync(siteDir)) return undefined;
  const files = fs.readdirSync(siteDir).filter((name: string) => name.endsWith(".json") && name !== "latest.json").sort();
  return files.length ? path.join(siteDir, files[files.length - 1]) : undefined;
}

export function diffSiteMapFiles(previousPath: string, currentPath: string): SiteMapDiff {
  return diffSiteMaps(loadSiteMap(previousPath), loadSiteMap(currentPath));
}
