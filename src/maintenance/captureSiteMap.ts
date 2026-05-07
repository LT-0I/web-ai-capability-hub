const fs = require("node:fs");
const path = require("node:path");
import { PageSnapshot, SiteMap } from "../shared/types";
import { siteMapFromSnapshot } from "../adapters/siteMap";
import { getStoragePaths, safeFilename, timestampForFilename } from "../utils/paths";

export function captureSiteMapForSnapshot(site: string, snapshot: PageSnapshot, notes?: string): SiteMap {
  return siteMapFromSnapshot(site, snapshot, notes);
}

export function saveSiteMap(siteMap: SiteMap, siteMapDir = getStoragePaths().siteMapDir): string {
  const siteDir = path.join(siteMapDir, safeFilename(siteMap.site));
  fs.mkdirSync(siteDir, { recursive: true });
  const filePath = path.join(siteDir, `${timestampForFilename(new Date(siteMap.capturedAt))}.json`);
  fs.writeFileSync(filePath, JSON.stringify(siteMap, null, 2), "utf-8");
  const latestPath = path.join(siteDir, "latest.json");
  fs.writeFileSync(latestPath, JSON.stringify(siteMap, null, 2), "utf-8");
  return filePath;
}
