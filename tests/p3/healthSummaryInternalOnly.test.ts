import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");
import { getHealthSummary } from "../../src/runtime/health/summary";
import { listMcpTools } from "../../src/mcp/tools";

const CONTRACT = JSON.parse(fs.readFileSync(path.join(process.cwd(), "configs/consumer-contract.json"), "utf8"));

test("p3: getHealthSummary() returns a HealthSummary shape with profilePool/tabLease/driftEvents/cancel/build keys", () => {
  const summary = getHealthSummary({ listMcpToolsFn: () => new Array(193).fill(null) });
  assert.ok(summary && typeof summary === "object");
  assert.ok("profile_pool" in summary);
  assert.ok("tab_lease" in summary);
  assert.ok("drift_events" in summary);
  assert.ok("cancel" in summary);
  assert.ok("build" in summary);
  assert.equal(typeof summary.profile_pool.active_leases_count, "number");
  assert.equal(typeof summary.tab_lease.active_count, "number");
  assert.equal(typeof summary.drift_events.total_rows, "number");
  assert.equal(typeof summary.cancel.total_cancel_requests_last_24h, "number");
  assert.equal(summary.build.list_mcp_tools_count, 193);
  assert.equal(summary.build.package_version, "1.0.0");
  assert.equal(summary.build.contract_version, "consumer-contract-1.7.1");
});

test("p3: listMcpTools() does NOT include any tool named *health_summary*", () => {
  const names = listMcpTools().map((t: any) => String(t.name));
  const leaks = names.filter((n) => /health_summary/i.test(n));
  assert.deepEqual(leaks, [], `health_summary must remain internal; found leaked MCP tool(s): ${JSON.stringify(leaks)}`);
});

test("p3: consumer-contract.json commands array does NOT include any name containing 'health_summary'", () => {
  const commands = (CONTRACT.commands || []) as Array<{ name?: string }>;
  const leaks = commands.map((c) => c.name || "").filter((n) => /health_summary/i.test(n));
  assert.deepEqual(leaks, [], `health_summary must not be promoted to consumer contract; found: ${JSON.stringify(leaks)}`);
});
