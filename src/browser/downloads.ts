const fs = require("node:fs");
const path = require("node:path");
import { DownloadRecord } from "../shared/types";
import { logger } from "../utils/logger";
import { ensureDir, safeFilename, timestampForFilename } from "../utils/paths";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combineFailure(current: string | null, error: unknown): string | null {
  if (error === null || error === undefined) return current;
  const next = errorMessage(error);
  return current ? `${current}; ${next}` : next;
}

export class DownloadManager {
  private records: DownloadRecord[] = [];

  constructor(private downloadDir: string) {
    ensureDir(downloadDir);
  }

  list(): DownloadRecord[] {
    return [...this.records];
  }

  async saveDownload(download: any, suggestedName?: string): Promise<DownloadRecord> {
    const id = `download-${this.records.length + 1}`;
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

    const fileName = `${timestampForFilename()}-${safeFilename(suggestedFilename)}`;
    let savedPath = path.join(this.downloadDir, fileName);

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

    let url: string | undefined;
    try {
      url = download && typeof download.url === "function" ? download.url() : undefined;
    } catch (error) {
      failure = combineFailure(failure, error);
      logger.warn({ suggestedFilename, failure }, "Download URL could not be read");
    }

    const record: DownloadRecord = {
      id,
      suggestedFilename,
      savedPath,
      url,
      timestamp: new Date().toISOString(),
      failure
    };
    this.records.push(record);
    return record;
  }
}
