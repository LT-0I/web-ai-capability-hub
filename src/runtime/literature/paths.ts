const path = require("node:path");
import { ensureDir } from "../../utils/paths";

export const LITERATURE_RATE_LIMIT_DB_ENV = "WEBAI_LITERATURE_RATE_LIMIT_DB";
export const LITERATURE_QUEUE_DB_ENV = "WEBAI_LITERATURE_QUEUE_DB";

export function literatureDataDir(): string {
  return ensureDir(path.resolve(process.cwd(), "data"));
}

export function literatureRateLimitDbPath(): string {
  return path.resolve(process.env[LITERATURE_RATE_LIMIT_DB_ENV] || path.join(literatureDataDir(), "literature-rate-limit.sqlite"));
}

export function literatureQueueDbPath(): string {
  return path.resolve(process.env[LITERATURE_QUEUE_DB_ENV] || path.join(literatureDataDir(), "literature-queue.sqlite"));
}

export function literatureDownloadsDir(): string {
  return ensureDir(path.resolve(process.cwd(), "data", "literature-downloads"));
}
