const assert = require("node:assert/strict");

const {
  ALLOWED_CATEGORIES,
  SOURCE_FILES,
  convertSourceFiles
} = require("../scripts/import_gemini_catalog.js");

function run() {
  const payload = convertSourceFiles({ rootDir: process.cwd() });
  const records = payload.capabilities;

  assert.equal(payload.schemaVersion, 1);
  assert.equal(SOURCE_FILES.length, 4);
  assert.ok(records.length > 100, "manual catalogs should expand to granular records");
  assert.equal(new Set(records.map((record) => record.name)).size, records.length);

  for (const record of records) {
    assert.equal(record.target_id, "gemini");
    assert.ok(ALLOWED_CATEGORIES.includes(record.category), `${record.name} category ${record.category}`);
    assert.equal(record.status, "active");
    assert.equal(record.confidence, 0.9);
    assert.deepEqual(record.selectors, []);
    assert.equal(record.evidence.source, "manual_exploration");
    assert.ok(record.evidence.observed_at);
    assert.match(record.name, /^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    assert.ok(record.description.includes("Source path:"));
    assert.ok(record.description.includes("Details:"));
  }

  const byName = new Map(records.map((record) => [record.name, record]));
  for (const requiredName of [
    "canvas_audio_overview",
    "canvas_export_to_docs",
    "image_download_full_size",
    "scheduled_actions_create"
  ]) {
    assert.ok(byName.has(requiredName), `missing ${requiredName}`);
  }

  assert.ok(byName.get("canvas_audio_overview").description.includes("duration 5:24"));
  assert.ok(byName.get("image_download_full_size").description.includes("Download full size image"));
  assert.ok(byName.get("scheduled_actions_create").description.includes("Create button"));
}

run();
console.log("import_gemini_catalog conversion test passed");
