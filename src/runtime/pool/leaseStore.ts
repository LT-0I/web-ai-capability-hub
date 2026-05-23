const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { optionalRequire } from "../../utils/optionalRequire";
import { ensureDir, getStoragePaths } from "../../utils/paths";

export type LeaseStatus = "active" | "released" | "expired" | "cancelled";

export interface ProfileLeaseRow {
  lease_id: string;
  profile_id: string;
  run_id: string;
  acquired_at: string;
  ttl_seconds: number;
  last_heartbeat_at: string;
  pid: number;
  cdp_endpoint?: string;
  status: LeaseStatus | string;
}

export interface TabLeaseRow {
  lease_id: string;
  profile_lease_id: string;
  url_match: string;
  acquired_at: string;
  ttl_seconds: number;
  last_heartbeat_at?: string;
  status: LeaseStatus | string;
}

export interface ElementBankRow {
  id: string;
  manifest_id?: string;
  selector_role?: string;
  target?: string;
  state_hash?: string;
  primary_css?: string;
  primary_xpath?: string;
  aria_role?: string;
  aria_name?: string;
  near_text_json?: string;
  bbox_json?: string;
  dom_fingerprint?: string;
  last_success_at?: string;
  last_failure_at?: string;
  success_count?: number;
  failure_count?: number;
}

const RUNTIME_MIGRATION_PATHS = [
  path.join(__dirname, "migrations", "0001_v3_2_runtime.sql"),
  path.resolve(process.cwd(), "src/runtime/pool/migrations/0001_v3_2_runtime.sql"),
  path.resolve(__dirname, "../../../../src/runtime/pool/migrations/0001_v3_2_runtime.sql")
];
const RUNTIME_MIGRATION_FALLBACK = `CREATE TABLE IF NOT EXISTS profile_leases (
  lease_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, run_id TEXT NOT NULL,
  acquired_at TEXT, ttl_seconds INTEGER, last_heartbeat_at TEXT,
  pid INTEGER, cdp_endpoint TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS tab_leases (
  lease_id TEXT PRIMARY KEY, profile_lease_id TEXT, url_match TEXT,
  acquired_at TEXT, ttl_seconds INTEGER, last_heartbeat_at TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS element_bank (
  id TEXT PRIMARY KEY, manifest_id TEXT, selector_role TEXT, target TEXT,
  state_hash TEXT, primary_css TEXT, primary_xpath TEXT,
  aria_role TEXT, aria_name TEXT, near_text_json TEXT, bbox_json TEXT,
  dom_fingerprint TEXT, last_success_at TEXT, last_failure_at TEXT,
  success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS drift_events (
  run_id TEXT, manifest_id TEXT, selector_role TEXT,
  resolution_step INTEGER, confidence REAL, component_scores_json TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS cancel_requests (
  run_id TEXT PRIMARY KEY, requested_at TEXT, reason TEXT
);
`;
const RUNTIME_MIGRATION_SOURCE = RUNTIME_MIGRATION_PATHS.find((candidate: string) => fs.existsSync(candidate));
const RUNTIME_MIGRATION = RUNTIME_MIGRATION_SOURCE ? fs.readFileSync(RUNTIME_MIGRATION_SOURCE, "utf8") : RUNTIME_MIGRATION_FALLBACK;

function now(): string { return new Date().toISOString(); }
function leaseId(prefix: string): string { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
function expired(row: { acquired_at?: string; last_heartbeat_at?: string; ttl_seconds?: number }, multiplier = 1): boolean {
  const ttl = Number(row.ttl_seconds || 0);
  if (!ttl) return false;
  const anchor = Date.parse(row.last_heartbeat_at || row.acquired_at || "");
  return Number.isFinite(anchor) && Date.now() - anchor > ttl * 1000 * multiplier;
}
function isPidAlive(pid: number | undefined | null): boolean {
  if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
  if (process.platform === "linux" && fs.existsSync("/proc")) return fs.existsSync(`/proc/${pid}`);
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function profileLeaseTimedOut(row: { acquired_at?: string; last_heartbeat_at?: string; ttl_seconds?: number; pid?: number }): boolean {
  return expired(row, 2) && isPidAlive(row.pid);
}

export class RuntimeLeaseStore {
  readonly dbPath: string;
  private sqlite: any;
  private memory = {
    profile_leases: [] as ProfileLeaseRow[],
    tab_leases: [] as TabLeaseRow[],
    element_bank: [] as ElementBankRow[],
    drift_events: [] as any[],
    cancel_requests: [] as any[]
  };

  constructor(dbPath = process.env.WAH_RUNTIME_SQLITE_PATH || path.join(getStoragePaths().dataDir, "drift_events.sqlite")) {
    this.dbPath = path.resolve(dbPath);
    const Database = optionalRequire<any>("better-sqlite3");
    if (Database) {
      ensureDir(path.dirname(this.dbPath));
      this.sqlite = new Database(this.dbPath);
      this.sqlite.exec(RUNTIME_MIGRATION);
      this.ensureRuntimeColumns();
    }
  }

  driver(): "better-sqlite3" | "memory" { return this.sqlite ? "better-sqlite3" : "memory"; }

  private mirrorProfileLease(row: ProfileLeaseRow): void {
    const index = this.memory.profile_leases.findIndex((item) => item.lease_id === row.lease_id);
    if (index >= 0) this.memory.profile_leases[index] = { ...this.memory.profile_leases[index], ...row };
    else this.memory.profile_leases.push({ ...row });
  }

  private mirroredProfileLease(leaseIdValue: string): ProfileLeaseRow | undefined {
    return this.memory.profile_leases.find((item) => item.lease_id === leaseIdValue);
  }

  private mirrorTabLease(row: TabLeaseRow): void {
    const index = this.memory.tab_leases.findIndex((item) => item.lease_id === row.lease_id);
    if (index >= 0) this.memory.tab_leases[index] = { ...this.memory.tab_leases[index], ...row };
    else this.memory.tab_leases.push({ ...row });
  }

  private mirroredTabLease(leaseIdValue: string): TabLeaseRow | undefined {
    return this.memory.tab_leases.find((item) => item.lease_id === leaseIdValue);
  }

  private ensureRuntimeColumns(): void {
    if (!this.sqlite) return;
    const columns = (table: string): Set<string> => new Set(this.sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row: any) => row.name));
    const tabLeaseColumns = columns("tab_leases");
    if (!tabLeaseColumns.has("last_heartbeat_at")) this.sqlite.exec(`ALTER TABLE tab_leases ADD COLUMN last_heartbeat_at TEXT`);
  }

  private findActiveProfileLease(profileId: string): ProfileLeaseRow | undefined {
    if (this.sqlite) {
      const row = this.sqlite.prepare(`SELECT * FROM profile_leases WHERE profile_id=? AND status='active' ORDER BY acquired_at DESC LIMIT 1`).get(profileId);
      if (row) return { ...row, pid: Number(row.pid), ttl_seconds: Number(row.ttl_seconds) };
    }
    return this.memory.profile_leases.filter((row) => row.profile_id === profileId && row.status === "active").sort((a, b) => b.acquired_at.localeCompare(a.acquired_at))[0];
  }

  private findActiveTabLease(profileLeaseId: string, urlMatch: string): TabLeaseRow | undefined {
    if (this.sqlite) {
      const row = this.sqlite.prepare(`SELECT * FROM tab_leases WHERE profile_lease_id=? AND url_match=? AND status='active' ORDER BY acquired_at DESC LIMIT 1`).get(profileLeaseId, urlMatch);
      if (row) return { ...row, ...(this.mirroredTabLease(row.lease_id) || {}), ttl_seconds: Number((this.mirroredTabLease(row.lease_id) || row).ttl_seconds) };
    }
    return this.memory.tab_leases.filter((row) => row.profile_lease_id === profileLeaseId && row.url_match === urlMatch && row.status === "active").sort((a, b) => b.acquired_at.localeCompare(a.acquired_at))[0];
  }

  private profileTimeoutError(row: ProfileLeaseRow): Error {
    const error: any = new Error(`PROFILE_LEASE_TIMEOUT: profile ${row.profile_id} lease ${row.lease_id} is older than 2x TTL while holder pid ${row.pid} is still alive`);
    error.errorCode = "PROFILE_LEASE_TIMEOUT";
    error.evidence = { lease_id: row.lease_id, profile_id: row.profile_id, run_id: row.run_id, ttl_seconds: row.ttl_seconds, last_heartbeat_at: row.last_heartbeat_at, pid: row.pid };
    return error;
  }

  private tabExpiredError(row: TabLeaseRow): Error {
    const error: any = new Error(`TAB_LEASE_EXPIRED: tab lease ${row.lease_id} for ${row.url_match} expired before a new acquire`);
    error.errorCode = "TAB_LEASE_EXPIRED";
    error.evidence = { lease_id: row.lease_id, profile_lease_id: row.profile_lease_id, url_match: row.url_match, ttl_seconds: row.ttl_seconds, acquired_at: row.acquired_at, last_heartbeat_at: row.last_heartbeat_at };
    return error;
  }

  gcExpiredLeases(): { profiles: number; tabs: number } {
    const at = now();
    let profiles = 0;
    let tabs = 0;
    if (this.sqlite) {
      const activeProfiles = this.sqlite.prepare(`SELECT * FROM profile_leases WHERE status='active'`).all();
      const expireProfile = this.sqlite.prepare(`UPDATE profile_leases SET status='expired' WHERE lease_id=?`);
      for (const row of activeProfiles) {
        const mirrored = this.mirroredProfileLease(row.lease_id);
        const observed = { ...row, ...(mirrored || {}), pid: Number((mirrored || row).pid) };
        if (profileLeaseTimedOut(observed) || (observed.pid && !isPidAlive(observed.pid)) || (!observed.pid && expired(observed))) {
          expireProfile.run(row.lease_id);
          this.mirrorProfileLease({ ...observed, status: "expired", last_heartbeat_at: at });
          profiles++;
        } else {
          this.mirrorProfileLease({ ...row, pid: Number(row.pid) });
        }
      }
      const activeTabs = this.sqlite.prepare(`SELECT * FROM tab_leases WHERE status='active'`).all();
      const expireTab = this.sqlite.prepare(`UPDATE tab_leases SET status='expired' WHERE lease_id=?`);
      for (const row of activeTabs) {
        const mirrored = this.mirroredTabLease(row.lease_id);
        const observed = { ...row, ...(mirrored || {}), ttl_seconds: Number((mirrored || row).ttl_seconds) };
        if (expired(observed)) {
          expireTab.run(row.lease_id);
          this.mirrorTabLease({ ...observed, status: "expired" });
          tabs++;
        } else {
          this.mirrorTabLease({ ...row, ttl_seconds: Number(row.ttl_seconds) });
        }
      }
      return { profiles, tabs };
    }
    for (const row of this.memory.profile_leases) {
      if (row.status === "active" && (profileLeaseTimedOut(row) || !isPidAlive(row.pid))) { row.status = "expired"; row.last_heartbeat_at = at; profiles++; }
    }
    for (const row of this.memory.tab_leases) if (row.status === "active" && expired(row)) { row.status = "expired"; tabs++; }
    return { profiles, tabs };
  }

  activeProfileLease(profileId: string): ProfileLeaseRow | undefined {
    this.gcExpiredLeases();
    return this.findActiveProfileLease(profileId);
  }

  acquireProfileLease(profileId: string, runId: string, cdpEndpoint: string | undefined, ttlSeconds = 300, pid = process.pid): ProfileLeaseRow {
    const beforeGc = this.findActiveProfileLease(profileId);
    const mirrored = beforeGc ? this.mirroredProfileLease(beforeGc.lease_id) : undefined;
    const observed = beforeGc ? { ...beforeGc, ...(mirrored || {}), pid: Number((mirrored || beforeGc).pid), ttl_seconds: Number((mirrored || beforeGc).ttl_seconds) } : undefined;
    if (observed && profileLeaseTimedOut(observed)) {
      this.releaseProfileLease(observed.lease_id, "expired");
      throw this.profileTimeoutError(observed);
    }
    this.gcExpiredLeases();
    const existing = this.activeProfileLease(profileId);
    if (existing && existing.run_id !== runId) {
      const error: any = new Error(`PROFILE_LEASE_BUSY: profile ${profileId} is already leased by run ${existing.run_id}`);
      error.errorCode = "PROFILE_LEASE_BUSY";
      error.evidence = { existing };
      throw error;
    }
    const row: ProfileLeaseRow = {
      lease_id: existing?.lease_id || leaseId("profile_lease"),
      profile_id: profileId,
      run_id: runId,
      acquired_at: existing?.acquired_at || now(),
      ttl_seconds: ttlSeconds,
      last_heartbeat_at: now(),
      pid,
      cdp_endpoint: cdpEndpoint,
      status: "active"
    };
    if (this.sqlite) this.sqlite.prepare(`INSERT INTO profile_leases (lease_id, profile_id, run_id, acquired_at, ttl_seconds, last_heartbeat_at, pid, cdp_endpoint, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(lease_id) DO UPDATE SET run_id=excluded.run_id, ttl_seconds=excluded.ttl_seconds, last_heartbeat_at=excluded.last_heartbeat_at, pid=excluded.pid, cdp_endpoint=excluded.cdp_endpoint, status=excluded.status`).run(row.lease_id, row.profile_id, row.run_id, row.acquired_at, row.ttl_seconds, row.last_heartbeat_at, row.pid, row.cdp_endpoint || null, row.status);
    this.mirrorProfileLease(row);
    return row;
  }

  heartbeatProfileLease(leaseIdValue: string): void {
    const heartbeatAt = now();
    if (this.sqlite) this.sqlite.prepare(`UPDATE profile_leases SET last_heartbeat_at=? WHERE lease_id=? AND status='active'`).run(heartbeatAt, leaseIdValue);
    const row = this.memory.profile_leases.find((item) => item.lease_id === leaseIdValue && item.status === "active");
    if (row) row.last_heartbeat_at = heartbeatAt;
  }

  renewProfileLease(leaseIdValue: string, ttlSeconds: number): void {
    const current = this.memory.profile_leases.find((item) => item.lease_id === leaseIdValue);
    const increment = Math.max(1, Math.floor(ttlSeconds));
    if (this.sqlite) this.sqlite.prepare(`UPDATE profile_leases SET ttl_seconds=ttl_seconds+? WHERE lease_id=? AND status='active'`).run(increment, leaseIdValue);
    if (current && current.status === "active") current.ttl_seconds = Number(current.ttl_seconds || 0) + increment;
  }

  releaseProfileLease(leaseIdValue: string, status: LeaseStatus = "released"): void {
    const releasedAt = now();
    if (this.sqlite) this.sqlite.prepare(`UPDATE profile_leases SET status=?, last_heartbeat_at=? WHERE lease_id=?`).run(status, releasedAt, leaseIdValue);
    const row = this.memory.profile_leases.find((item) => item.lease_id === leaseIdValue);
    if (row) { row.status = status; row.last_heartbeat_at = releasedAt; }
  }

  acquireTabLease(profileLeaseId: string, urlMatch: string, ttlSeconds = 300): TabLeaseRow {
    const existing = this.findActiveTabLease(profileLeaseId, urlMatch);
    if (existing && expired(existing)) {
      this.releaseTabLease(existing.lease_id, "expired");
      throw this.tabExpiredError(existing);
    }
    if (existing) return existing;
    this.gcExpiredLeases();
    const row: TabLeaseRow = { lease_id: leaseId("tab_lease"), profile_lease_id: profileLeaseId, url_match: urlMatch, acquired_at: now(), ttl_seconds: ttlSeconds, last_heartbeat_at: now(), status: "active" };
    if (this.sqlite) this.sqlite.prepare(`INSERT INTO tab_leases (lease_id, profile_lease_id, url_match, acquired_at, ttl_seconds, last_heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(row.lease_id, row.profile_lease_id, row.url_match, row.acquired_at, row.ttl_seconds, row.last_heartbeat_at || row.acquired_at, row.status);
    this.mirrorTabLease(row);
    return row;
  }

  heartbeatTabLease(leaseIdValue: string): void {
    const heartbeatAt = now();
    if (this.sqlite) this.sqlite.prepare(`UPDATE tab_leases SET last_heartbeat_at=? WHERE lease_id=? AND status='active'`).run(heartbeatAt, leaseIdValue);
    const row = this.memory.tab_leases.find((item) => item.lease_id === leaseIdValue && item.status === "active");
    if (row) row.last_heartbeat_at = heartbeatAt;
  }

  renewTabLease(leaseIdValue: string, ttlSeconds: number): void {
    const increment = Math.max(1, Math.floor(ttlSeconds));
    if (this.sqlite) this.sqlite.prepare(`UPDATE tab_leases SET ttl_seconds=ttl_seconds+? WHERE lease_id=? AND status='active'`).run(increment, leaseIdValue);
    const row = this.memory.tab_leases.find((item) => item.lease_id === leaseIdValue && item.status === "active");
    if (row) row.ttl_seconds = Number(row.ttl_seconds || 0) + increment;
  }

  releaseTabLease(leaseIdValue: string, status: LeaseStatus = "released"): void {
    if (this.sqlite) this.sqlite.prepare(`UPDATE tab_leases SET status=? WHERE lease_id=?`).run(status, leaseIdValue);
    const row = this.memory.tab_leases.find((item) => item.lease_id === leaseIdValue);
    if (row) row.status = status;
  }

  upsertElement(row: ElementBankRow): ElementBankRow {
    if (this.sqlite) this.sqlite.prepare(`INSERT INTO element_bank (id, manifest_id, selector_role, target, state_hash, primary_css, primary_xpath, aria_role, aria_name, near_text_json, bbox_json, dom_fingerprint, last_success_at, last_failure_at, success_count, failure_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET manifest_id=excluded.manifest_id, selector_role=excluded.selector_role, target=excluded.target, state_hash=excluded.state_hash, primary_css=excluded.primary_css, primary_xpath=excluded.primary_xpath, aria_role=excluded.aria_role, aria_name=excluded.aria_name, near_text_json=excluded.near_text_json, bbox_json=excluded.bbox_json, dom_fingerprint=excluded.dom_fingerprint, last_success_at=excluded.last_success_at, last_failure_at=excluded.last_failure_at, success_count=excluded.success_count, failure_count=excluded.failure_count`).run(row.id, row.manifest_id || null, row.selector_role || null, row.target || null, row.state_hash || null, row.primary_css || null, row.primary_xpath || null, row.aria_role || null, row.aria_name || null, row.near_text_json || null, row.bbox_json || null, row.dom_fingerprint || null, row.last_success_at || null, row.last_failure_at || null, row.success_count || 0, row.failure_count || 0);
    const index = this.memory.element_bank.findIndex((item) => item.id === row.id);
    if (index >= 0) this.memory.element_bank[index] = row; else this.memory.element_bank.push(row);
    return row;
  }

  insertDriftEvent(event: { run_id: string; manifest_id: string; selector_role: string; resolution_step: number; confidence: number; component_scores_json: string; ts?: string }): void {
    const row = { ...event, ts: event.ts || now() };
    if (this.sqlite) this.sqlite.prepare(`INSERT INTO drift_events (run_id, manifest_id, selector_role, resolution_step, confidence, component_scores_json, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(row.run_id, row.manifest_id, row.selector_role, row.resolution_step, row.confidence, row.component_scores_json, row.ts);
    this.memory.drift_events.push(row);
  }

  requestCancel(runId: string, reason?: string): void {
    const requestedAt = now();
    if (this.sqlite) this.sqlite.prepare(`INSERT INTO cancel_requests (run_id, requested_at, reason) VALUES (?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET requested_at=excluded.requested_at, reason=excluded.reason`).run(runId, requestedAt, reason || null);
    const existing = this.memory.cancel_requests.find((row) => row.run_id === runId);
    if (existing) Object.assign(existing, { requested_at: requestedAt, reason }); else this.memory.cancel_requests.push({ run_id: runId, requested_at: requestedAt, reason });
  }

  cancelRequested(runId: string): { run_id: string; requested_at: string; reason?: string } | undefined {
    if (this.sqlite) return this.sqlite.prepare(`SELECT * FROM cancel_requests WHERE run_id=?`).get(runId);
    return this.memory.cancel_requests.find((row) => row.run_id === runId);
  }

  clearCancelRequest(runId: string): void {
    if (this.sqlite) this.sqlite.prepare(`DELETE FROM cancel_requests WHERE run_id=?`).run(runId);
    this.memory.cancel_requests = this.memory.cancel_requests.filter((row) => row.run_id !== runId);
  }

  listDriftEvents(): any[] {
    if (this.sqlite) return this.sqlite.prepare(`SELECT * FROM drift_events ORDER BY ts, rowid`).all();
    return [...this.memory.drift_events];
  }

  listProfileLeases(): ProfileLeaseRow[] {
    if (this.sqlite) return this.sqlite.prepare(`SELECT * FROM profile_leases ORDER BY acquired_at, lease_id`).all().map((row: any) => ({ ...row, pid: Number(row.pid), ttl_seconds: Number(row.ttl_seconds) }));
    return [...this.memory.profile_leases];
  }

  listTabLeases(): TabLeaseRow[] {
    if (this.sqlite) return this.sqlite.prepare(`SELECT * FROM tab_leases ORDER BY acquired_at, lease_id`).all().map((row: any) => ({ ...row, ttl_seconds: Number(row.ttl_seconds) }));
    return [...this.memory.tab_leases];
  }

  listCancelRequests(): Array<{ run_id: string; requested_at: string; reason?: string }> {
    if (this.sqlite) return this.sqlite.prepare(`SELECT * FROM cancel_requests ORDER BY requested_at, run_id`).all();
    return [...this.memory.cancel_requests];
  }
}

let defaultStore: RuntimeLeaseStore | undefined;
export function runtimeLeaseStore(): RuntimeLeaseStore {
  if (!defaultStore) defaultStore = new RuntimeLeaseStore();
  return defaultStore;
}

let gcStarted = false;
export function startLeaseGc(store = runtimeLeaseStore()): void {
  if (gcStarted) return;
  gcStarted = true;
  const timer = setInterval(() => store.gcExpiredLeases(), 60000);
  timer.unref?.();
}
