import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");

import { legacyResearchToolSpecs } from "../../src/mcp/researchdb/legacyToolSpecs";
import { listMcpTools } from "../../src/mcp/tools";

test("p3: legacyToolSpecs.ts exists at the documented path", () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), "src/mcp/researchdb/legacyToolSpecs.ts")));
});

test("p3: legacyResearchToolSpecs is a non-empty array of ToolSpec-shaped objects", () => {
  assert.ok(Array.isArray(legacyResearchToolSpecs));
  assert.ok(legacyResearchToolSpecs.length > 0, "bridge must surface >0 tool specs");
  for (const spec of legacyResearchToolSpecs.slice(0, 5)) {
    assert.equal(typeof spec.name, "string");
    assert.equal(typeof spec.description, "string");
    assert.ok(spec.schema, "every bridged spec must carry a schema");
    assert.equal(typeof spec.handler, "function");
  }
});

test("p3: every name surfaced by the bridge appears in listMcpTools() (no masked deletions)", () => {
  const runtimeNames = new Set(listMcpTools().map((t: any) => String(t.name)));
  const missing = legacyResearchToolSpecs.map((s) => s.name).filter((n) => !runtimeNames.has(n));
  assert.deepEqual(missing, [], `bridge surfaces names not present in listMcpTools(): ${JSON.stringify(missing)}`);
});

test("p3: bridge only carries research_ names (no accidental cross-namespace bleed)", () => {
  const bad = legacyResearchToolSpecs.map((s) => s.name).filter((n) => !n.startsWith("research_"));
  assert.deepEqual(bad, [], `non-research_ names in legacy bridge: ${JSON.stringify(bad)}`);
});
