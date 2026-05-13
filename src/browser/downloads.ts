const fs = require("node:fs");
const path = require("node:path");
import { DownloadRecord } from "../shared/types";
import { logger } from "../utils/logger";
import { ensureDir, safeFilename } from "../utils/paths";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combineFailure(current: string | null, error: unknown): string | null {
  if (error === null || error === undefined) return current;
  const next = errorMessage(error);
  return current ? `${current}; ${next}` : next;
}

function uniquePath(dir: string, suggestedFilename: string): string {
  const parsed = path.parse(safeFilename(suggestedFilename));
  const base = parsed.name || "download";
  const ext = parsed.ext || "";
  let candidate = path.join(dir, `${base}${ext}`);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}(${index})${ext}`);
    index += 1;
  }
  return candidate;
}

function statSize(filePath: string): number | undefined {
  try { return fs.existsSync(filePath) ? fs.statSync(filePath).size : undefined; } catch { return undefined; }
}

function readJsonFile(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface SaveDownloadOptions {
  profile?: string;
  tabId?: string;
  mimeType?: string;
  sourceUrl?: string;
}

export interface SaveBufferOptions extends SaveDownloadOptions {
  filename: string;
  bytes: Buffer;
}

export class DownloadManager {
  private records: DownloadRecord[] = [];
  private manifestPath: string;

  constructor(private downloadDir: string) {
    ensureDir(downloadDir);
    this.manifestPath = path.join(downloadDir, ".downloads.json");
    this.records = readJsonFile(this.manifestPath) as DownloadRecord[];
  }

  list(options: { profile?: string; limit?: number } = {}): DownloadRecord[] {
    const limit = options.limit ?? 50;
    return this.records
      .filter((record) => !options.profile || record.profile === options.profile)
      .slice(-limit)
      .reverse()
      .map((record) => ({ ...record }));
  }

  async saveDownload(download: any, suggestedName?: string, options: SaveDownloadOptions = {}): Promise<DownloadRecord> {
    const id = `download-${Date.now()}-${this.records.length + 1}`;
    let suggestedFilename = suggestedName || `download-${Date.now()}`;
    let failure: string | null = null;

    try {
      if (download && typeof download.suggestedFilename === "function") {
        suggestedFilename = String(await download.suggestedFilename());
      }
    } catch (error) {
      failure = combineFailure(failure, error);
      logger.warn({ suggestedFilename, failure }, "Download suggested filename could not be read");
    }

    let savedPath = uniquePath(this.downloadDir, suggestedFilename);

    try {
      ensureDir(this.downloadDir);

      if (download && typeof download.saveAs === "function") {
        try {
          await download.saveAs(savedPath);
        } catch (error) {
          const previousFailure = failure;
          const saveAsFailure = errorMessage(error);
          failure = combineFailure(failure, saveAsFailure);
          let source: string | null = null;

          try {
            source = download && typeof download.path === "function" ? await download.path() : null;
          } catch (pathError) {
            const pathFailure = errorMessage(pathError);
            failure = combineFailure(failure, pathFailure);
            logger.warn({ suggestedFilename, failure, pathFailure }, `saveAs failed, no path available: ${failure}`);
          }

          if (source && fs.existsSync(source)) {
            try {
              fs.copyFileSync(source, savedPath);
              failure = previousFailure;
            } catch (copyError) {
              failure = combineFailure(previousFailure, copyError);
              logger.warn({ suggestedFilename, source, savedPath, failure }, "saveAs fallback copy failed");
              savedPath = source;
            }
          } else if (source) {
            logger.warn({ suggestedFilename, failure, source }, `saveAs failed and temp path missing; file may be at: ${source}`);
            savedPath = source;
          } else {
            logger.warn({ suggestedFilename, failure }, `saveAs failed, no path available: ${failure}`);
          }
        }
      } else if (download && typeof download.path === "function") {
        const source = await download.path();
        if (source && fs.existsSync(source)) {
          fs.copyFileSync(source, savedPath);
        } else {
          failure = `Download path unavailable: ${source || "null"}`;
          logger.warn({ suggestedFilename, failure, source }, "Download path was unavailable");
          if (source) savedPath = source;
        }
      } else {
        fs.writeFileSync(savedPath, "", "utf-8");
      }
    } catch (error) {
      failure = combineFailure(failure, error);
      logger.warn({ suggestedFilename, savedPath, failure }, "Download could not be saved");
    }

    try {
      if (download && typeof download.failure === "function") {
        failure = combineFailure(failure, await download.failure());
      }
    } catch (error) {
      failure = combineFailure(failure, error);
      logger.warn({ suggestedFilename, failure }, "Download failure status could not be read");
    }

    let url = options.sourceUrl;
    try {
      url = url || (download && typeof download.url === "function" ? download.url() : undefined);
    } catch (error) {
      failure = combineFailure(failure, error);
      logger.warn({ suggestedFilename, failure }, "Download URL could not be read");
    }

    const createdAt = new Date().toISOString();
    const record: DownloadRecord = {
      id,
      profile: options.profile,
      tabId: options.tabId,
      suggestedFilename,
      savedPath,
      sizeBytes: statSize(savedPath) ?? 0,
      mimeType: options.mimeType,
      createdAt,
      sourceUrl: url,
      url,
      timestamp: createdAt,
      failure
    };
    this.records.push(record);
    this.persist();
    return record;
  }

  async saveBuffer(options: SaveBufferOptions): Promise<DownloadRecord> {
    ensureDir(this.downloadDir);
    const savedPath = uniquePath(this.downloadDir, options.filename);
    fs.writeFileSync(savedPath, options.bytes);
    const createdAt = new Date().toISOString();
    const record: DownloadRecord = {
      id: `download-${Date.now()}-${this.records.length + 1}`,
      profile: options.profile,
      tabId: options.tabId,
      suggestedFilename: path.basename(savedPath),
      savedPath,
      sizeBytes: options.bytes.length,
      mimeType: options.mimeType,
      createdAt,
      sourceUrl: options.sourceUrl,
      url: options.sourceUrl,
      timestamp: createdAt,
      failure: null
    };
    this.records.push(record);
    this.persist();
    return record;
  }

  private persist(): void {
    try {
      ensureDir(this.downloadDir);
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.records, null, 2), "utf-8");
    } catch (error) {
      logger.warn({ error: errorMessage(error), manifestPath: this.manifestPath }, "Download manifest could not be written");
    }
  }
}
