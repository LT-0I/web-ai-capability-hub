import test from "node:test";
import assert from "node:assert/strict";
const fs = require("node:fs");
const path = require("node:path");

const FUTURE_PATH = path.join(process.cwd(), "docs/FUTURE_WORK.md");
const MIG_PATH = path.join(process.cwd(), "docs/MIGRATION_v3.2.md");

function readIfExists(p: string): string { return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }

const BODY = (readIfExists(FUTURE_PATH) || readIfExists(MIG_PATH));

test("p3: future-work doc exists and mentions Stagehand", () => {
  assert.match(BODY, /stagehand/i);
});

test("p3: future-work doc mentions Lightpanda", () => {
  assert.match(BODY, /lightpanda/i);
});

test("p3: future-work doc cites at least one numeric benchmark gate (ms/KB/%/runs)", () => {
  assert.match(BODY, /\d+\s*(ms|kb|%|runs|p\d+)/i);
});
