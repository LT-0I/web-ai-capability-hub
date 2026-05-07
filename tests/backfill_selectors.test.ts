const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { backfillSelectors } = require("../../scripts/backfill_selectors.js");

function tempDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "wah-backfill-test-")); }

function createCapabilitiesTable(db: any): void {
  db.exec(`
    CREATE TABLE capabilities (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      inputs TEXT,
      outputs TEXT,
      preconditions TEXT,
      selectors TEXT,
      status TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(target_id, name)
    );
  `);
}

function insertCapability(db: any, overrides: Record<string, unknown>): void {
  const row = {
    id: overrides.id || `cap-${overrides.name}`,
    target_id: "gemini",
    category: "manual",
    name: overrides.name,
    description: "manual description",
    inputs: JSON.stringify({ text: "string" }),
    outputs: JSON.stringify({ result: "string" }),
    preconditions: JSON.stringify(["manual precondition"]),
    selectors: JSON.stringify([]),
    status: "needs_review",
    confidence: 0.4,
    evidence: JSON.stringify({ source: "manual" }),
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
  db.prepare(`
    INSERT INTO capabilities
      (id, target_id, category, name, description, inputs, outputs, preconditions, selectors, status, confidence, evidence, updated_at)
    VALUES
      (@id, @target_id, @category, @name, @description, @inputs, @outputs, @preconditions, @selectors, @status, @confidence, @evidence, @updated_at)
  `).run(row);
}

test("backfillSelectors updates only empty selector rows matched by target and name", () => {
  const root = tempDir();
  const exportPath = path.join(root, "scratch.json");
  const dbPath = path.join(root, "main.sqlite");
  const db = new Database(dbPath);
  createCapabilitiesTable(db);
  insertCapability(db, { name: "manual_canvas", confidence: 0.4 });
  insertCapability(db, { name: "already_has_selectors", selectors: JSON.stringify(["#keep"]), confidence: 0.9 });
  insertCapability(db, { name: "null_selectors", selectors: null, confidence: 0.7 });

  fs.writeFileSync(exportPath, JSON.stringify({
    capabilities: [
      { target_id: "gemini", name: "manual_canvas", selectors: ["#canvas"], confidence: 0.8 },
      { target_id: "gemini", name: "already_has_selectors", selectors: ["#replace"], confidence: 1.0 },
      { target_id: "gemini", name: "null_selectors", selectors: ["#null"], confidence: 0.5 },
      { target_id: "gemini", name: "missing_in_main", selectors: ["#missing"], confidence: 0.6 },
      { target_id: "gemini", name: "ignored_without_selectors", selectors: [], confidence: 0.6 },
      { target_id: "other", name: "manual_canvas", selectors: ["#wrong-target"], confidence: 1.0 }
    ]
  }), "utf-8");

  const stats = backfillSelectors({ exportPath, dbPath, log: false });

  assert.deepEqual(stats, { matched: 3, updated: 2, skipped: 2 });

  const updated = db.prepare("SELECT * FROM capabilities WHERE target_id=? AND name=?").get("gemini", "manual_canvas");
  assert.equal(updated.selectors, JSON.stringify(["#canvas"]));
  assert.equal(updated.confidence, 0.8);
  assert.equal(updated.description, "manual description");
  assert.equal(updated.inputs, JSON.stringify({ text: "string" }));
  assert.equal(updated.outputs, JSON.stringify({ result: "string" }));
  assert.equal(updated.preconditions, JSON.stringify(["manual precondition"]));
  assert.equal(updated.status, "needs_review");
  assert.equal(updated.updated_at, "2026-01-01T00:00:00.000Z");

  const already = db.prepare("SELECT selectors, confidence FROM capabilities WHERE target_id=? AND name=?").get("gemini", "already_has_selectors");
  assert.equal(already.selectors, JSON.stringify(["#keep"]));
  assert.equal(already.confidence, 0.9);

  const nullSelectors = db.prepare("SELECT selectors, confidence FROM capabilities WHERE target_id=? AND name=?").get("gemini", "null_selectors");
  assert.equal(nullSelectors.selectors, JSON.stringify(["#null"]));
  assert.equal(nullSelectors.confidence, 0.7);

  db.close();
});
