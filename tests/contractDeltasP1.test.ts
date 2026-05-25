import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTRACT = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "configs/consumer-contract.json"), "utf8"));

const EXPECTED_WAH_NAMES = [
  "wah_capability_query",
  "wah_adapter_health",
  "wah_policy_explain",
  "wah_task_start",
  "wah_task_status",
  "wah_task_cancel",
  "wah_task_resume",
  "wah_artifact_get"
];

test("P3 contract: package_version = 2.1.0, contract_version = consumer-contract-2.1.0", () => {
  assert.equal(CONTRACT.package_version, "2.1.0");
  assert.equal(CONTRACT.contract_version, "consumer-contract-2.1.0");
});

test("P1 contract: commands.length === 232", () => {
  assert.equal(CONTRACT.commands.length, 232);
});

test("P1 contract: error_codes.length === 40", () => {
  assert.equal(CONTRACT.error_codes.length, 40);
});

test("P1 contract: exactly 8 commands with mcp_name starting wah_", () => {
  const wahCommands = CONTRACT.commands.filter((c: any) => typeof c.mcp_name === "string" && c.mcp_name.startsWith("wah_"));
  assert.equal(wahCommands.length, 8, `expected 8 wah_* commands, got ${wahCommands.length}`);
  const names = wahCommands.map((c: any) => c.mcp_name).sort();
  assert.deepEqual(names, [...EXPECTED_WAH_NAMES].sort());
});

test("P1 contract: every wah_* command row has cli_name, mcp_name, ts_export, output_keys", () => {
  for (const name of EXPECTED_WAH_NAMES) {
    const row = CONTRACT.commands.find((c: any) => c.mcp_name === name);
    assert.ok(row, `row missing for ${name}`);
    assert.match(row.cli_name, /^wah:/);
    assert.equal(row.mcp_name, name);
    assert.match(row.ts_export, /^wah[A-Z]/);
    assert.ok(row.output_keys && Array.isArray(row.output_keys.always_present));
  }
});

test("P1 contract: webai_ row count is 81 after Phase 8 Bucket E", () => {
  const webai = CONTRACT.commands.filter((c: any) => typeof c.mcp_name === "string" && c.mcp_name.startsWith("webai_"));
  assert.equal(webai.length, 81);
});

test("P1 contract: research_ row count is UNCHANGED at 121", () => {
  const research = CONTRACT.commands.filter((c: any) => typeof c.mcp_name === "string" && c.mcp_name.startsWith("research_"));
  assert.equal(research.length, 121);
});

test("P1 contract: error_codes includes UI_DRIFT_DETECTED and HEAL_CONFIDENCE_LOW", () => {
  // error_codes is a flat string[] in this contract version
  assert.ok(CONTRACT.error_codes.includes("UI_DRIFT_DETECTED"), "UI_DRIFT_DETECTED missing");
  assert.ok(CONTRACT.error_codes.includes("HEAL_CONFIDENCE_LOW"), "HEAL_CONFIDENCE_LOW missing");
  assert.ok(CONTRACT.error_codes.includes("LITERATURE_QUEUED"), "LITERATURE_QUEUED missing");
});

test("P1/P2/extension/phase8 contract: error_codes ordering appends literature queue after extension bridge codes", () => {
  const last8 = CONTRACT.error_codes.slice(-8);
  assert.deepEqual(last8, [
    "UI_DRIFT_DETECTED",
    "HEAL_CONFIDENCE_LOW",
    "PROFILE_LEASE_TIMEOUT",
    "TAB_LEASE_EXPIRED",
    "CHROME_EXTENSION_NOT_CONNECTED",
    "CHROME_EXTENSION_PERMISSION_DENIED",
    "CHROME_EXTENSION_DEBUGGER_UNAVAILABLE",
    "LITERATURE_QUEUED"
  ]);
});

test("P1 contract: no existing 181-row mcp_name was renamed or removed", () => {
  const wahCount = CONTRACT.commands.filter((c: any) => c.mcp_name.startsWith("wah_")).length;
  // 232 - 8 wah_* - 2 W1 selectors - 41 Phase 8 literature tools should give 181 originals; cross-check
  const w1SelectorCount = CONTRACT.commands.filter((c: any) => ["webai_chatgpt_select_model", "webai_claude_select_model"].includes(c.mcp_name)).length;
  const phase8Count = CONTRACT.commands.filter((c: any) => typeof c.mcp_name === "string" && /^webai_(literature_task_status|(?:arxiv|scoap3|mdpi|frontiers|pubscholar|scielo|inspirehep|aip|aps|iop|optica|opticsjournal|siam|aiaa|asce|asme|ieee|iest|iet|sae|acs|cellpress|nature|rsc|royalsoc|cambridge|degruyter|emerald|sciencedirect|springer|tandf|wiley|acm|crc|dblp|incopat|proquest|wanfang|worldsci|wos)_download_pdf)$/.test(c.mcp_name)).length;
  assert.equal(CONTRACT.commands.length - wahCount - w1SelectorCount - phase8Count, 181);
});

test("P1 contract: every command has the standard required keys", () => {
  for (const cmd of CONTRACT.commands) {
    assert.ok(typeof cmd.cli_name === "string", `command missing cli_name: ${JSON.stringify(cmd)}`);
    assert.ok(typeof cmd.mcp_name === "string");
    assert.ok(typeof cmd.ts_export === "string");
    assert.ok(typeof cmd.maturity === "string");
    assert.ok(typeof cmd.safety_class === "string");
    assert.ok(typeof cmd.may_contain_sensitive_local_fields === "boolean");
  }
});
