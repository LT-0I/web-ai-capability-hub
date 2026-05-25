import { literatureRateLimitDbPath } from "./paths";
import { openLiteratureSqlite, SqliteDatabase } from "./sqlite";

export const LITERATURE_DOWNLOAD_CAP_PER_DB = 20;
export const LITERATURE_WINDOW_MS = 24 * 60 * 60 * 1000;

const LEDGER_SCHEMA = `
CREATE TABLE IF NOT EXISTS download_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  db_slug TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  url TEXT,
  downloaded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_db_time ON download_ledger(db_slug, downloaded_at);
`;

const ledgerDb = openLiteratureSqlite(literatureRateLimitDbPath(), LEDGER_SCHEMA);

function windowStart(now: number): number {
  return now - LITERATURE_WINDOW_MS;
}

export function literatureLedgerDbForInternalUse(): SqliteDatabase {
  return ledgerDb;
}

// READ-ONLY query; returns count of downloads for this DB in the trailing 24h.
export function countDownloadsLast24h(db_slug: string, now: number): number {
  const row = ledgerDb.prepare(`
    SELECT COUNT(*) AS count
    FROM download_ledger
    WHERE db_slug = ? AND downloaded_at > ?
  `).get(db_slug, windowStart(now)) as { count?: number } | undefined;
  return Number(row?.count || 0);
}

// READ-ONLY decision. Returns:
//   { allowed: true }                             — under cap, proceed
//   { allowed: false, retryAfterMs: number }      — at cap, caller should enqueue
export function assertLiteratureQuota(db_slug: string, now: number): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const since = windowStart(now);
  const row = ledgerDb.prepare(`
    SELECT COUNT(*) AS count, MIN(downloaded_at) AS oldest
    FROM download_ledger
    WHERE db_slug = ? AND downloaded_at > ?
  `).get(db_slug, since) as { count?: number; oldest?: number | null } | undefined;
  const count = Number(row?.count || 0);
  if (count < LITERATURE_DOWNLOAD_CAP_PER_DB) return { allowed: true };
  const oldest = Number(row?.oldest || now);
  const retryAfterMs = Math.max(1, oldest + LITERATURE_WINDOW_MS - now);
  return { allowed: false, retryAfterMs };
}

// WRITE: append a successful download to the ledger.
export function recordLiteratureDownload(
  db_slug: string,
  doc_id: string,
  path: string,
  sha256: string,
  url: string | null,
  now: number,
): void {
  ledgerDb.prepare(`
    INSERT INTO download_ledger (db_slug, doc_id, path, sha256, url, downloaded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(db_slug, doc_id, path, sha256, url, now);
}
