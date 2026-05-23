import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");

const DOC = fs.readFileSync(path.join(process.cwd(), "docs/MIGRATION_v3.2.md"), "utf8");

test("p3: docs/MIGRATION_v3.2.md is at least 500 words", () => {
  const wordCount = DOC.split(/\s+/).filter(Boolean).length;
  assert.ok(wordCount >= 500, `expected >=500 words, got ${wordCount}`);
});

test("p3: docs/MIGRATION_v3.2.md references the wah_ family (8 new tools)", () => {
  assert.match(DOC, /wah_/);
});

test("p3: docs/MIGRATION_v3.2.md documents UI_DRIFT_DETECTED and/or error code #33", () => {
  assert.ok(/UI_DRIFT_DETECTED/.test(DOC) || /#\s*33\b/.test(DOC), "expected UI_DRIFT_DETECTED or #33 mention");
});

test("p3: docs/MIGRATION_v3.2.md references the 1.0.0 GA cut", () => {
  assert.match(DOC, /\b1\.0\.0\b/);
});

test("p3: docs/MIGRATION_v3.2.md mentions legacy webai_ and research_ names still work", () => {
  assert.match(DOC, /webai_/);
  assert.match(DOC, /research_/);
});
