import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");

const PKG = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const CONTRACT = JSON.parse(fs.readFileSync(path.join(process.cwd(), "configs/consumer-contract.json"), "utf8"));
const VERIFY = fs.readFileSync(path.join(process.cwd(), "scripts/verify-contract-version.ts"), "utf8");

test("p3: package.json version is 1.0.0", () => {
  assert.equal(PKG.version, "1.0.0");
});

test("p3: consumer-contract.json package_version is 1.0.0", () => {
  assert.equal(CONTRACT.package_version, "1.0.0");
});

test("p3: consumer-contract.json contract_version is consumer-contract-1.9.0 after Chrome Extension Phase 4", () => {
  assert.equal(CONTRACT.contract_version, "consumer-contract-1.9.0");
});

test("p3: scripts/verify-contract-version.ts EXPECTED_PACKAGE_VERSION === '1.0.0'", () => {
  assert.match(VERIFY, /EXPECTED_PACKAGE_VERSION\s*=\s*"1\.0\.0"/);
});

test("p3: scripts/verify-contract-version.ts EXPECTED_CONTRACT_VERSION === 'consumer-contract-1.9.0'", () => {
  assert.match(VERIFY, /EXPECTED_CONTRACT_VERSION\s*=\s*"consumer-contract-1\.9\.0"/);
});
