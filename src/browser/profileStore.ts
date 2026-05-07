const fs = require("node:fs");
const path = require("node:path");
import { ensureDir, getStoragePaths } from "../utils/paths";

export interface BrowserProfileRecord {
  profileName: string;
  browserType: "chrome" | "edge" | "chromium" | "unknown";
  profileDir: string;
  executablePath?: string;
  cdpEndpoint?: string;
  cdpPort?: number;
  processId?: number;
  lastStatus?: string;
  launchedByPackage?: boolean;
  updatedAt: string;
}

interface ProfileStoreFile {
  version: number;
  profiles: BrowserProfileRecord[];
}

function now(): string { return new Date().toISOString(); }

export class BrowserProfileStore {
  readonly profilesRoot: string;
  readonly metadataPath: string;

  constructor(root = process.cwd()) {
    const storage = getStoragePaths(root);
    this.profilesRoot = ensureDir(path.join(storage.dataDir, "browser-profiles"));
    this.metadataPath = path.join(this.profilesRoot, "profiles.json");
  }

  resolveProfileDir(profileName = process.env.WAH_DEFAULT_PROFILE || "default"): string {
    return ensureDir(path.join(this.profilesRoot, safeProfileName(profileName)));
  }

  get(profileName = process.env.WAH_DEFAULT_PROFILE || "default"): BrowserProfileRecord {
    const existing = this.read().profiles.find((profile) => profile.profileName === profileName);
    if (existing) return existing;
    return {
      profileName,
      browserType: "unknown",
      profileDir: this.resolveProfileDir(profileName),
      updatedAt: now()
    };
  }

  list(): BrowserProfileRecord[] {
    return this.read().profiles;
  }

  upsert(record: Partial<BrowserProfileRecord> & { profileName: string }): BrowserProfileRecord {
    const file = this.read();
    const current = file.profiles.find((profile) => profile.profileName === record.profileName) || this.get(record.profileName);
    const merged: BrowserProfileRecord = {
      ...current,
      ...record,
      profileDir: record.profileDir || current.profileDir || this.resolveProfileDir(record.profileName),
      browserType: record.browserType || current.browserType || "unknown",
      updatedAt: now()
    };
    const index = file.profiles.findIndex((profile) => profile.profileName === record.profileName);
    if (index >= 0) file.profiles[index] = merged;
    else file.profiles.push(merged);
    this.write(file);
    return merged;
  }

  updateStatus(profileName: string, status: Partial<BrowserProfileRecord>): BrowserProfileRecord {
    return this.upsert({ profileName, ...status });
  }

  private read(): ProfileStoreFile {
    if (!fs.existsSync(this.metadataPath)) return { version: 1, profiles: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.metadataPath, "utf-8"));
      return { version: parsed.version || 1, profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [] };
    } catch {
      return { version: 1, profiles: [] };
    }
  }

  private write(file: ProfileStoreFile): void {
    ensureDir(path.dirname(this.metadataPath));
    fs.writeFileSync(this.metadataPath, JSON.stringify(file, null, 2), "utf-8");
  }
}

export function safeProfileName(profileName: string): string {
  return (profileName || "default").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}
