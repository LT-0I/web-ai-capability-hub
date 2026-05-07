const fs = require("node:fs");
const path = require("node:path");

export interface StoragePaths {
  root: string;
  dataDir: string;
  profileDir: string;
  downloadDir: string;
  screenshotDir: string;
  siteMapDir: string;
  logsDir: string;
}

export function resolveProjectPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getStoragePaths(root = process.cwd()): StoragePaths {
  const dataDir = path.resolve(root, "data");
  const profileDir = path.resolve(root, process.env.WAH_PROFILE_DIR || "data/browser-profile");
  const downloadDir = path.resolve(root, process.env.WAH_DOWNLOAD_DIR || "data/downloads");
  const screenshotDir = path.resolve(root, process.env.WAH_SCREENSHOT_DIR || "data/screenshots");
  const siteMapDir = path.resolve(root, process.env.WAH_SITE_MAP_DIR || "data/site-maps");
  const logsDir = path.resolve(root, "data/logs");
  [dataDir, profileDir, downloadDir, screenshotDir, siteMapDir, logsDir].forEach(ensureDir);
  return { root, dataDir, profileDir, downloadDir, screenshotDir, siteMapDir, logsDir };
}

export function safeFilename(input: string): string {
  const base = input.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
  return base || `file-${Date.now()}`;
}

export function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
