import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateToolSpecs } from "./toolSpec";
import { verifyContractVersion } from "../../../scripts/verify-contract-version";

test("generator skeleton returns no generated specs for an empty manifest set", () => {
  assert.deepEqual(generateToolSpecs([]), []);
  assert.equal(typeof verifyContractVersion, "function");
});

test("golden MCP tool snapshot has the expected minimal shape", () => {
  const goldenPath = path.resolve(process.cwd(), "tests/golden/listMcpTools.185.json");
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8")) as {
    tools: Array<Record<string, unknown>>;
  };

  assert.equal(golden.tools.length, 185);
  for (const [index, tool] of golden.tools.entries()) {
    assert.equal(typeof tool.name, "string", `tools[${index}].name`);
    assert.equal(typeof tool.description, "string", `tools[${index}].description`);
    assert.equal(Object.prototype.hasOwnProperty.call(tool, "inputSchema"), true, `tools[${index}].inputSchema`);
  }
});
