const test = require("node:test");
const assert = require("node:assert/strict");
import { diffSiteMaps } from "../src/adapters/siteMap";

test("site map diff reports added and removed elements", () => {
  const previous: any = { site: "mock", capturedAt: "2026-01-01T00:00:00Z", url: "u", title: "t", elements: [{ ref: "e1", role: "button", name: "Search", selector: "#search" }], forms: [], tables: [], lists: [] };
  const current: any = { site: "mock", capturedAt: "2026-01-02T00:00:00Z", url: "u", title: "t", elements: [{ ref: "e1", role: "button", name: "Find", selector: "#find" }], forms: [], tables: [], lists: [] };
  const diff = diffSiteMaps(previous, current);
  assert.equal(diff.addedElements.length, 1);
  assert.equal(diff.removedElements.length, 1);
  assert.ok(diff.summary.includes("added"));
});
