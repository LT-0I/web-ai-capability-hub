const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../capabilities/database";
import { ProfileLeaseRecord } from "../capabilities/schemas";
import { BrowserProfileStore, safeProfileName } from "./profileStore";

export interface ProcessChecker { (pid: number): boolean; }
export interface ProfileAuditEntry {
  profileId: string;
  profileDir: string;
  chromePid?: number;
  chromeAlive: boolean;
  cacheSizeBytes: number;
  lastUsedAt?: string;
  staleLockFiles: string[];
  lease?: ProfileLeaseRecord;
}

const LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function acquireProfileLease(args: { profileId: string; userDataDir: string; runId?: string; ownerPid?: number; chromeProcessPid?: number; database?: CapabilityDatabase }): ProfileLeaseRecord {
  const db = args.database || new CapabilityDatabase();
  const at = new Date().toISOString();
  const row: ProfileLeaseRecord = {
    id: CapabilityDatabase.stableId("lease", `${args.profileId}:${args.runId || args.ownerPid || process.pid}`),
    profile_id: args.profileId,
    run_id: args.runId,
    owner_pid: args.ownerPid || process.pid,
    acquired_at: at,
    last_heartbeat_at: at,
    chrome_process_pid: args.chromeProcessPid,
    user_data_dir: args.userDataDir
  };
  return db.upsertProfileLease(row);
}

export function releaseProfileLease(profileId: string, args: { database?: CapabilityDatabase; releasedAt?: string } = {}): ProfileLeaseRecord | undefined {
  const db = args.database || new CapabilityDatabase();
  const lease = db.getActiveProfileLease(profileId);
  if (!lease) return undefined;
  const released = { ...lease, released_at: args.releasedAt || new Date().toISOString() };
  db.upsertProfileLease(released);
  return released;
}

export function auditProfiles(args: { store?: BrowserProfileStore; database?: CapabilityDatabase; isPidAlive?: ProcessChecker } = {}): ProfileAuditEntry[] {
  const store = args.store || new BrowserProfileStore();
  const db = args.database || new CapabilityDatabase();
  const alive = args.isPidAlive || isPidAlive;
  const dirs = new Map<string, string>();
  for (const record of store.list()) dirs.set(record.profileName, record.profileDir);
  if (fs.existsSync(store.profilesRoot)) {
    for (const entry of fs.readdirSync(store.profilesRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.set(entry.name, path.join(store.profilesRoot, entry.name));
    }
  }
  return [...dirs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([profileId, profileDir]) => {
    const lease = db.getActiveProfileLease(profileId) || db.getActiveProfileLease(safeProfileName(profileId));
    const record = store.get(profileId);
    const chromePid = lease?.chrome_process_pid || record.processId;
    const chromeAlive = chromePid ? alive(chromePid) : false;
    return {
      profileId,
      profileDir,
      ...(chromePid ? { chromePid } : {}),
      chromeAlive,
      cacheSizeBytes: directorySize(path.join(profileDir, "Default", "Cache")) + directorySize(path.join(profileDir, "Cache")),
      lastUsedAt: lastModified(profileDir),
      staleLockFiles: LOCK_FILES.map((name) => path.join(profileDir, name)).filter((file) => fs.existsSync(file) && !chromeAlive),
      ...(lease ? { lease } : {})
    };
  });
}

export function releaseLeaseAndCleanLocks(profileId: string, args: { force?: boolean; database?: CapabilityDatabase; store?: BrowserProfileStore; isPidAlive?: ProcessChecker } = {}): { ok: boolean; profileId: string; released?: boolean; cleanedLockFiles: string[]; errorCode?: string; message?: string } {
  const store = args.store || new BrowserProfileStore();
  const db = args.database || new CapabilityDatabase();
  const alive = args.isPidAlive || isPidAlive;
  const lease = db.getActiveProfileLease(profileId);
  const record = store.get(profileId);
  const chromePid = lease?.chrome_process_pid || record.processId;
  if (chromePid && alive(chromePid) && !args.force) return { ok: false, profileId, cleanedLockFiles: [], errorCode: "PROFILE_LEASE_BUSY", message: `Profile ${profileId} is still owned by live Chrome pid ${chromePid}.` };
  const profileDir = lease?.user_data_dir || record.profileDir;
  const cleanedLockFiles: string[] = [];
  for (const file of LOCK_FILES.map((name) => path.join(profileDir, name))) {
    if (fs.existsSync(file)) { fs.rmSync(file, { force: true }); cleanedLockFiles.push(file); }
  }
  const released = releaseProfileLease(profileId, { database: db });
  return { ok: true, profileId, released: !!released, cleanedLockFiles };
}

function directorySize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += directorySize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch { /* best effort */ }
  }
  return total;
}

function lastModified(dir: string): string | undefined {
  try { return fs.statSync(dir).mtime.toISOString(); } catch { return undefined; }
}
