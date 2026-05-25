const fs = require("node:fs");
const path = require("node:path");
const BetterSqlite3 = require("better-sqlite3");

export type SqliteDatabase = any;

const handles = new Map<string, SqliteDatabase>();

export function openLiteratureSqlite(dbPath: string, schemaSql: string): SqliteDatabase {
  const resolved = path.resolve(dbPath);
  const existing = handles.get(resolved);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new BetterSqlite3(resolved);
  db.pragma("busy_timeout = 5000");
  db.exec(schemaSql);
  handles.set(resolved, db);
  return db;
}
