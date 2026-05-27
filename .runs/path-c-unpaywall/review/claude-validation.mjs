#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const root = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(root, "configs/consumer-contract.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(root, "tests/golden/listMcpTools.236.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.strictEqual(pkg.version, "2.2.0", "package.json version");
assert.strictEqual(contract.package_version, "2.2.0", "contract package_version");
assert.strictEqual(contract.contract_version, "consumer-contract-2.2.0");
assert.strictEqual(contract.commands.length, 232, "commands lock");
assert.strictEqual(contract.error_codes.length, 40, "error_codes lock");
assert.strictEqual(golden.count, 236);
assert.strictEqual(golden.tools.length, 236);
assert.strictEqual(contract.commands.filter(c => /^webai_/.test(c.mcp_name || "")).length, 81, "webai_ lock");
assert.strictEqual(contract.commands.filter(c => /^research_/.test(c.mcp_name || "")).length, 121, "research_ lock");

const dlCmds = contract.commands.filter(c => /^webai_.+_download_pdf$/.test(c.mcp_name || ""));
assert.strictEqual(dlCmds.length, 40, "expected 40 webai_*_download_pdf rows");

const paywalled = dlCmds.filter(c => Array.isArray(c.optional_args) && c.optional_args.includes("pdf_url"));
const nonPaywalled = dlCmds.filter(c => !paywalled.includes(c));
console.log(`paywalled=${paywalled.length} non-paywalled=${nonPaywalled.length}`);

for (const cmd of paywalled) {
  const ap = (cmd.output_keys && cmd.output_keys.always_present) || [];
  const opt = cmd.optional_args || [];
  assert.ok(ap.includes("oa_source"), `${cmd.mcp_name}: missing oa_source in always_present`);
  assert.ok(opt.includes("unpaywall_email"), `${cmd.mcp_name}: missing unpaywall_email in optional_args`);
}

for (const cmd of nonPaywalled) {
  const opt = cmd.optional_args || [];
  assert.ok(!opt.includes("unpaywall_email"), `${cmd.mcp_name}: unexpected unpaywall_email on non-paywalled cmd`);
}

const goldenByName = new Map(golden.tools.map(t => [t.name, t]));
for (const cmd of paywalled) {
  const tool = goldenByName.get(cmd.mcp_name);
  assert.ok(tool, `golden listMcpTools missing tool ${cmd.mcp_name}`);
  const props = (tool.inputSchema && tool.inputSchema.properties) || {};
  assert.ok(
    props.unpaywall_email && props.unpaywall_email.type === "string",
    `${cmd.mcp_name}: golden inputSchema missing unpaywall_email:string`
  );
  assert.ok(!(tool.inputSchema.required || []).includes("unpaywall_email"),
    `${cmd.mcp_name}: unpaywall_email must remain optional in required[]`);
}

const sens = (contract.sensitive_fields || {}).unpaywall_email;
assert.ok(typeof sens === "string" && /redact/i.test(sens),
  "sensitive_fields.unpaywall_email must be classified as redact-in-logs");

const litDir = path.join(root, "src/mcp/submcp/literature");
const expectedOptIn = [
  "acs", "aps", "asce", "cambridge", "emerald", "ieee", "iet", "iop",
  "nature", "optica", "rsc", "sae", "sciencedirect", "siam", "springer",
  "tandf", "wiley"
];
for (const slug of expectedOptIn) {
  const driverPath = path.join(litDir, `${slug}.ts`);
  assert.ok(fs.existsSync(driverPath), `opt-in driver missing: ${driverPath}`);
  const src = fs.readFileSync(driverPath, "utf8");
  assert.ok(/unpaywall_fallback:\s*true/.test(src), `${slug}: expected unpaywall_fallback:true`);
}

for (const slug of ["proquest", "incopat", "wanfang"]) {
  const driverPath = path.join(litDir, `${slug}.ts`);
  assert.ok(fs.existsSync(driverPath), `excluded driver missing: ${driverPath}`);
  const src = fs.readFileSync(driverPath, "utf8");
  assert.ok(!/unpaywall_fallback:\s*true/.test(src), `${slug}: must not enable Unpaywall fallback`);
  assert.ok(/oa_source\s*:/.test(src), `${slug}: custom handler must preserve oa_source outputs`);
}

console.log(`PASS — ${paywalled.length} paywalled commands carry oa_source + unpaywall_email; ${expectedOptIn.length} DOI drivers opt in; excluded DBs stay out; locks intact.`);
