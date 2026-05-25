const crypto = require("node:crypto");
import { literatureQueueDbPath } from "./paths";
import { openLiteratureSqlite, SqliteDatabase } from "./sqlite";

export type LiteratureTaskStatus = "queued" | "running" | "done" | "fail";

export interface LiteratureTaskRecord {
  task_id: string;
  db_slug: string;
  doc_id: string;
  status: LiteratureTaskStatus;
  queued_at: number;
  started_at: number | null;
  completed_at: number | null;
  result_path: string | null;
  error: string | null;
}

export interface ClaimedLiteratureTask {
  task_id: string;
  doc_id: string;
  requested_url: string | null;
}

const QUEUE_SCHEMA = `
CREATE TABLE IF NOT EXISTS download_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL UNIQUE,
  db_slug TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  requested_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','done','fail')),
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  result_path TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status_db ON download_queue(status, db_slug);
CREATE INDEX IF NOT EXISTS idx_queue_task ON download_queue(task_id);
`;

const queueDb = openLiteratureSqlite(literatureQueueDbPath(), QUEUE_SCHEMA);

function uuidV4(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rowToRecord(row: any): LiteratureTaskRecord {
  return {
    task_id: String(row.task_id),
    db_slug: String(row.db_slug),
    doc_id: String(row.doc_id),
    status: row.status as LiteratureTaskStatus,
    queued_at: Number(row.queued_at),
    started_at: row.started_at == null ? null : Number(row.started_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
    result_path: row.result_path == null ? null : String(row.result_path),
    error: row.error == null ? null : String(row.error)
  };
}

export function literatureQueueDbForInternalUse(): SqliteDatabase {
  return queueDb;
}

export function enqueueLiteratureDownload(
  db_slug: string,
  doc_id: string,
  requested_url: string | null,
  now: number,
): { task_id: string; queued_at: number } {
  const task_id = uuidV4();
  queueDb.prepare(`
    INSERT INTO download_queue (task_id, db_slug, doc_id, requested_url, status, queued_at)
    VALUES (?, ?, ?, ?, 'queued', ?)
  `).run(task_id, db_slug, doc_id, requested_url, now);
  return { task_id, queued_at: now };
}

export function getLiteratureTaskStatus(task_id: string): LiteratureTaskRecord | null {
  const row = queueDb.prepare(`
    SELECT task_id, db_slug, doc_id, status, queued_at, started_at, completed_at, result_path, error
    FROM download_queue
    WHERE task_id = ?
  `).get(task_id);
  return row ? rowToRecord(row) : null;
}

// Internal — used only by the worker.
export function claimNextTaskForDb(db_slug: string, now: number): ClaimedLiteratureTask | null {
  const claim = queueDb.transaction((slug: string, startedAt: number): ClaimedLiteratureTask | null => {
    const row = queueDb.prepare(`
      SELECT id, task_id, doc_id, requested_url
      FROM download_queue
      WHERE status = 'queued' AND db_slug = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(slug) as { id: number; task_id: string; doc_id: string; requested_url: string | null } | undefined;
    if (!row) return null;
    const result = queueDb.prepare(`
      UPDATE download_queue
      SET status = 'running', started_at = ?, error = NULL
      WHERE id = ? AND status = 'queued'
    `).run(startedAt, row.id);
    if (result.changes !== 1) return null;
    return { task_id: row.task_id, doc_id: row.doc_id, requested_url: row.requested_url };
  });
  return claim(db_slug, now);
}

export function markTaskRunning(task_id: string, now: number): void {
  queueDb.prepare(`
    UPDATE download_queue
    SET status = 'running', started_at = COALESCE(started_at, ?), error = NULL
    WHERE task_id = ? AND status IN ('queued', 'running')
  `).run(now, task_id);
}

export function markTaskDone(task_id: string, result_path: string, now: number): void {
  queueDb.prepare(`
    UPDATE download_queue
    SET status = 'done', completed_at = ?, result_path = ?, error = NULL
    WHERE task_id = ?
  `).run(now, result_path, task_id);
}

export function markTaskFailed(task_id: string, error: string, now: number): void {
  queueDb.prepare(`
    UPDATE download_queue
    SET status = 'fail', completed_at = ?, error = ?
    WHERE task_id = ?
  `).run(now, error, task_id);
}

export function listQueuedLiteratureDbSlugs(): string[] {
  const rows = queueDb.prepare(`
    SELECT DISTINCT db_slug
    FROM download_queue
    WHERE status = 'queued'
    ORDER BY db_slug ASC
  `).all() as Array<{ db_slug: string }>;
  return rows.map((row) => String(row.db_slug));
}

export function resetRunningLiteratureTasks(now: number): number {
  void now;
  const result = queueDb.prepare(`
    UPDATE download_queue
    SET status = 'queued', started_at = NULL, error = NULL
    WHERE status = 'running'
  `).run();
  return Number(result.changes || 0);
}
