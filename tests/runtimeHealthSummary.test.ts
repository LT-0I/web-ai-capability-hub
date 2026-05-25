import test from "node:test";
import assert from "node:assert/strict";
import { RuntimeLeaseStore } from "../src/runtime/pool/leaseStore";
import { getHealthSummary } from "../src/runtime/health/summary";

function tempPath(label: string): string { return `/tmp/${label}-${Date.now()}-${Math.random()}.sqlite`; }
function isoAgo(now: Date, ms: number): string { return new Date(now.getTime() - ms).toISOString(); }

function updateRow(store: RuntimeLeaseStore, table: string, key: string, value: string, updates: Record<string, unknown>): void {
  const sqlite = (store as any).sqlite;
  if (sqlite) {
    const assignments = Object.keys(updates).map((column) => `${column}=?`).join(", ");
    sqlite.prepare(`UPDATE ${table} SET ${assignments} WHERE ${key}=?`).run(...Object.values(updates), value);
    return;
  }
  const rows = (store as any).memory[table] as Array<Record<string, unknown>>;
  const row = rows.find((item) => item[key] === value);
  if (row) Object.assign(row, updates);
}

test("runtime health summary reports leases, drift, cancel, and build locks without adding an MCP tool", () => {
  const store = new RuntimeLeaseStore(tempPath("runtime-health-summary"));
  const stuckProfile = store.acquireProfileLease("stuck", "run-stuck", undefined, 10, process.pid);
  const releasedProfile = store.acquireProfileLease("released", "run-released", undefined, 300, process.pid);
  store.releaseProfileLease(releasedProfile.lease_id, "released");
  const activeTab = store.acquireTabLease(stuckProfile.lease_id, "chatgpt", 120);
  const expiredTab = store.acquireTabLease(stuckProfile.lease_id, "gemini", 5);
  store.releaseTabLease(expiredTab.lease_id, "expired");

  const now = new Date();
  updateRow(store, "profile_leases", "lease_id", stuckProfile.lease_id, { last_heartbeat_at: isoAgo(now, 21_000) });
  updateRow(store, "profile_leases", "lease_id", releasedProfile.lease_id, { last_heartbeat_at: isoAgo(now, 30 * 60 * 1000) });
  updateRow(store, "tab_leases", "lease_id", activeTab.lease_id, { last_heartbeat_at: isoAgo(now, 30_000) });

  store.insertDriftEvent({ run_id: "r1", manifest_id: "m1", selector_role: "prompt", resolution_step: 1, confidence: 0.6, component_scores_json: "{}", ts: isoAgo(now, 60 * 60 * 1000) });
  store.insertDriftEvent({ run_id: "r2", manifest_id: "m1", selector_role: "prompt", resolution_step: 1, confidence: 0.8, component_scores_json: "{}", ts: isoAgo(now, 59 * 60 * 1000) });
  store.insertDriftEvent({ run_id: "r3", manifest_id: "m2", selector_role: "submit", resolution_step: 1, confidence: 0.3, component_scores_json: "{}", ts: isoAgo(now, 58 * 60 * 1000) });

  store.requestCancel("recent", "test");
  store.requestCancel("old", "old");
  updateRow(store, "cancel_requests", "run_id", "recent", { requested_at: isoAgo(now, 60 * 60 * 1000) });
  updateRow(store, "cancel_requests", "run_id", "old", { requested_at: isoAgo(now, 48 * 60 * 60 * 1000) });

  const summary = getHealthSummary({ store, now, listMcpToolsFn: () => new Array(228).fill(null) });
  assert.equal(summary.profile_pool.active_leases_count, 1);
  assert.equal(summary.profile_pool.stuck_leases_count, 1);
  assert.equal(summary.profile_pool.released_in_last_1h_count, 1);
  assert.equal(summary.tab_lease.active_count, 1);
  assert.equal(summary.tab_lease.expired_count, 1);
  assert.equal(summary.tab_lease.average_ttl_remaining_ms, 90000);
  assert.equal(summary.drift_events.total_rows, 3);
  assert.deepEqual(summary.drift_events.top_selector_roles_by_miss[0], { selector_role: "prompt", miss_count: 2, average_confidence: 0.7 });
  assert.deepEqual(summary.drift_events.average_confidence_per_role.find((row) => row.selector_role === "submit"), { selector_role: "submit", average_confidence: 0.3 });
  assert.equal(summary.cancel.total_cancel_requests_last_24h, 1);
  assert.equal(summary.build.list_mcp_tools_count, 228);
  assert.match(summary.build.contract_version, /^consumer-contract-/);
});
