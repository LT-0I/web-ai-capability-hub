import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");
import { CONSUMER_ERROR_CODES } from "../../src/consumer/errorCodes";

const CONTRACT_PATH = path.join(process.cwd(), "configs", "consumer-contract.json");
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));

test("p2 contract: PROFILE_LEASE_TIMEOUT (#35) present in TS export and contract JSON at index 34", () => {
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("PROFILE_LEASE_TIMEOUT"));
  assert.ok(CONTRACT.error_codes.includes("PROFILE_LEASE_TIMEOUT"));
  // #35 is 1-indexed → array index 34
  assert.equal(CONTRACT.error_codes[34], "PROFILE_LEASE_TIMEOUT", "PROFILE_LEASE_TIMEOUT must be 35th entry (index 34) for taxonomy stability");
});

test("p2 contract: TAB_LEASE_EXPIRED (#36) present in TS export and contract JSON at index 35", () => {
  assert.ok((CONSUMER_ERROR_CODES as readonly string[]).includes("TAB_LEASE_EXPIRED"));
  assert.ok(CONTRACT.error_codes.includes("TAB_LEASE_EXPIRED"));
  assert.equal(CONTRACT.error_codes[35], "TAB_LEASE_EXPIRED", "TAB_LEASE_EXPIRED must be 36th entry (index 35) for taxonomy stability");
});

test("p2 contract: error_codes.length is exactly 36 (no over/under count)", () => {
  assert.equal(CONTRACT.error_codes.length, 36);
  assert.equal((CONSUMER_ERROR_CODES as readonly string[]).length, 36);
});

test("p2/P3 contract: contract_version remains consumer-contract-1.7.1; package_version is 1.0.0", () => {
  assert.equal(CONTRACT.contract_version, "consumer-contract-1.7.1");
  assert.equal(CONTRACT.package_version, "1.0.0");
});

test("p2 contract: TS error code export and JSON error_codes array are in lockstep order", () => {
  for (let i = 0; i < CONTRACT.error_codes.length; i++) {
    assert.equal(CONTRACT.error_codes[i], CONSUMER_ERROR_CODES[i], `mismatch at index ${i}: contract='${CONTRACT.error_codes[i]}' ts='${CONSUMER_ERROR_CODES[i]}'`);
  }
});
