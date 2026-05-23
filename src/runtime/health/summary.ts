import fs from "node:fs";
import path from "node:path";
import { RuntimeLeaseStore, runtimeLeaseStore, ProfileLeaseRow, TabLeaseRow } from "../pool/leaseStore";
import { listMcpTools } from "../../mcp/tools";

export interface RoleDriftSummary {
  selector_role: string;
  miss_count: number;
  average_confidence: number;
}

export interface HealthSummary {
  profile_pool: {
    active_leases_count: number;
    stuck_leases_count: number;
    released_in_last_1h_count: number;
  };
  tab_lease: {
    active_count: number;
    expired_count: number;
    average_ttl_remaining_ms: number;
  };
  drift_events: {
    total_rows: number;
    top_selector_roles_by_miss: RoleDriftSummary[];
    average_confidence_per_role: Array<{ selector_role: string; average_confidence: number }>;
  };
  cancel: {
    total_cancel_requests_last_24h: number;
  };
  build: {
    package_version: string;
    contract_version: string;
    list_mcp_tools_count: number;
  };
}

export interface HealthSummaryOptions {
  store?: RuntimeLeaseStore;
  now?: Date;
  packageJsonPath?: string;
  consumerContractPath?: string;
  listMcpToolsFn?: () => unknown[];
}

function parseTime(value?: string): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function ttlRemainingMs(row: { acquired_at?: string; last_heartbeat_at?: string; ttl_seconds?: number }, nowMs: number): number {
  const anchor = parseTime(row.last_heartbeat_at || row.acquired_at);
  const ttlMs = Math.max(0, Number(row.ttl_seconds || 0) * 1000);
  if (!anchor || !ttlMs) return 0;
  return Math.max(0, anchor + ttlMs - nowMs);
}

function isProfileStuck(row: ProfileLeaseRow, nowMs: number): boolean {
  if (row.status !== "active") return false;
  const anchor = parseTime(row.last_heartbeat_at || row.acquired_at);
  const ttlMs = Math.max(0, Number(row.ttl_seconds || 0) * 1000);
  return !!anchor && !!ttlMs && nowMs - anchor > ttlMs * 2;
}

function isReleasedInLastHour(row: ProfileLeaseRow, nowMs: number): boolean {
  if (row.status !== "released") return false;
  const releasedAt = parseTime(row.last_heartbeat_at || row.acquired_at);
  return !!releasedAt && nowMs - releasedAt <= 60 * 60 * 1000;
}

function isTabExpired(row: TabLeaseRow, nowMs: number): boolean {
  return row.status === "expired" || (row.status === "active" && ttlRemainingMs(row, nowMs) <= 0);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readJson(pathname: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return {};
  }
}

export function getHealthSummary(options: HealthSummaryOptions = {}): HealthSummary {
  const store = options.store || runtimeLeaseStore();
  const now = options.now || new Date();
  const nowMs = now.getTime();
  const profileLeases = store.listProfileLeases();
  const tabLeases = store.listTabLeases();
  const driftEvents = store.listDriftEvents();
  const cancelRequests = store.listCancelRequests();

  const activeTabs = tabLeases.filter((row) => row.status === "active");
  const totalRemaining = activeTabs.reduce((sum, row) => sum + ttlRemainingMs(row, nowMs), 0);
  const byRole = new Map<string, { miss_count: number; confidence_sum: number; confidence_count: number }>();
  for (const row of driftEvents) {
    const selectorRole = String(row.selector_role || "unknown");
    const current = byRole.get(selectorRole) || { miss_count: 0, confidence_sum: 0, confidence_count: 0 };
    current.miss_count += 1;
    const confidence = Number(row.confidence);
    if (Number.isFinite(confidence)) {
      current.confidence_sum += confidence;
      current.confidence_count += 1;
    }
    byRole.set(selectorRole, current);
  }
  const roleSummaries = [...byRole.entries()].map(([selector_role, value]) => ({
    selector_role,
    miss_count: value.miss_count,
    average_confidence: value.confidence_count ? round(value.confidence_sum / value.confidence_count) : 0
  })).sort((a, b) => b.miss_count - a.miss_count || a.selector_role.localeCompare(b.selector_role));

  const packageJson = readJson(options.packageJsonPath || path.join(process.cwd(), "package.json"));
  const contract = readJson(options.consumerContractPath || path.join(process.cwd(), "configs/consumer-contract.json"));

  return {
    profile_pool: {
      active_leases_count: profileLeases.filter((row) => row.status === "active").length,
      stuck_leases_count: profileLeases.filter((row) => isProfileStuck(row, nowMs)).length,
      released_in_last_1h_count: profileLeases.filter((row) => isReleasedInLastHour(row, nowMs)).length
    },
    tab_lease: {
      active_count: activeTabs.length,
      expired_count: tabLeases.filter((row) => isTabExpired(row, nowMs)).length,
      average_ttl_remaining_ms: activeTabs.length ? Math.round(totalRemaining / activeTabs.length) : 0
    },
    drift_events: {
      total_rows: driftEvents.length,
      top_selector_roles_by_miss: roleSummaries.slice(0, 5),
      average_confidence_per_role: roleSummaries.map(({ selector_role, average_confidence }) => ({ selector_role, average_confidence }))
    },
    cancel: {
      total_cancel_requests_last_24h: cancelRequests.filter((row) => nowMs - parseTime(row.requested_at) <= 24 * 60 * 60 * 1000).length
    },
    build: {
      package_version: String(packageJson.version || "unknown"),
      contract_version: String(contract.contract_version || "unknown"),
      list_mcp_tools_count: (options.listMcpToolsFn || listMcpTools)().length
    }
  };
}
