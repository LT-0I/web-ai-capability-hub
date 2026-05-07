#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DEFAULT_EXPORT_PATH = path.resolve(process.cwd(), "data/gemini_scratch_export.json");
const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data/capability-hub.sqlite");

function parseSelectors(value) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); }
    catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed.map((selector) => String(selector || "").trim()).filter(Boolean)));
}

function confidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function backfillSelectors(options = {}) {
  const exportPath = path.resolve(options.exportPath || DEFAULT_EXPORT_PATH);
  const dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
  const shouldLog = options.log !== false;

  const scratch = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
  const scratchCapabilities = Array.isArray(scratch.capabilities) ? scratch.capabilities : [];
  const db = new Database(dbPath);

  const selectMain = db.prepare("SELECT id, target_id, name, selectors, confidence FROM capabilities WHERE target_id=? AND name=?");
  const updateMain = db.prepare("UPDATE capabilities SET selectors=?, confidence=? WHERE id=?");

  const stats = { matched: 0, updated: 0, skipped: 0 };

  const tx = db.transaction((capabilities) => {
    for (const scratchCapability of capabilities) {
      const selectors = parseSelectors(scratchCapability.selectors);
      if (!selectors.length) continue;

      const targetId = scratchCapability.target_id;
      const name = scratchCapability.name;
      if (!targetId || !name) continue;

      const main = selectMain.get(targetId, name);
      if (!main) {
        stats.skipped += 1;
        continue;
      }
      stats.matched += 1;

      const mainSelectors = parseSelectors(main.selectors);
      if (mainSelectors.length > 0) continue;

      updateMain.run(
        JSON.stringify(selectors),
        Math.max(confidence(main.confidence), confidence(scratchCapability.confidence)),
        main.id
      );
      stats.updated += 1;
    }
  });

  try {
    tx(scratchCapabilities);
  } finally {
    db.close();
  }

  if (shouldLog) console.log(`matched ${stats.matched}, updated ${stats.updated}, skipped ${stats.skipped}`);
  return stats;
}

if (require.main === module) {
  backfillSelectors();
}

module.exports = { backfillSelectors, parseSelectors };
