const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ConsumerErrorCodes, isConsumerErrorCode } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { literatureDownloadsDir } from "../../../runtime/literature/paths";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota, recordLiteratureDownload } from "../../../runtime/literature/quota";
import { ensureDir, safeFilename } from "../../../utils/paths";

export interface LiteratureDownloadPdfArgs {
  doc_id: string;
  profile?: string;
  output_dir?: string;
}

export interface LiteratureDownloadPdfOutput {
  ok: boolean;
  task_id: string | null;
  path: string | null;
  sha256: string | null;
  size: number | null;
  downloaded_at: number | null;
  errorCode: string | null;
  message: string | null;
}

export interface LiteratureDownloadedPdf {
  path: string;
  sha256: string;
  size: number;
  downloaded_at: number;
  resolved_url: string | null;
}

export type LiteraturePdfResolver = (doc_id: string) => Promise<string | null> | string | null;
export type LiteratureRequestedUrlResolver = (doc_id: string) => string | null;

export class LiteratureDownloadError extends Error {
  errorCode: string;
  evidence?: Record<string, unknown>;
  constructor(errorCode: string, message: string, evidence?: Record<string, unknown>) {
    super(`${errorCode}: ${message}`);
    this.errorCode = errorCode;
    this.evidence = evidence;
  }
}

export function encodePathPreservingSlash(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function resolveArxivPdfUrl(doc_id: string): string {
  const id = String(doc_id || "").trim().replace(/^arxiv:/i, "").replace(/\.pdf$/i, "");
  if (!id) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  if (/^https?:\/\//i.test(id)) return id;
  return `https://arxiv.org/pdf/${encodePathPreservingSlash(id)}.pdf`;
}

function emptyOutput(overrides: Partial<LiteratureDownloadPdfOutput>): LiteratureDownloadPdfOutput {
  return {
    ok: false,
    task_id: null,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: null,
    message: null,
    ...overrides
  };
}

export function literatureErrorOutput(error: unknown): LiteratureDownloadPdfOutput {
  const candidate = error as { errorCode?: unknown };
  const code = isConsumerErrorCode(candidate?.errorCode) ? candidate.errorCode : ConsumerErrorCodes.UNKNOWN;
  const message = error instanceof Error ? error.message.replace(new RegExp(`^${code}:\\s*`), "") : String(error || code);
  return emptyOutput({ ok: false, errorCode: code, message });
}

export function defaultLiteratureOutputDir(db_slug: string, output_dir?: string): string {
  return ensureDir(path.resolve(output_dir || path.join(literatureDownloadsDir(), db_slug)));
}

function requireDocId(doc_id: unknown): string {
  const value = String(doc_id || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function downloadTargetPath(outputDir: string, docId: string): string {
  return path.resolve(outputDir, `${safeFilename(docId).replace(/\.pdf$/i, "")}.pdf`);
}

export async function downloadLiteraturePdfToDisk(
  db_slug: string,
  doc_id: string,
  requested_url: string | null,
  output_dir: string,
  resolvePdfUrl: LiteraturePdfResolver,
): Promise<LiteratureDownloadedPdf> {
  const resolved_url = requested_url || await resolvePdfUrl(doc_id);
  if (!resolved_url) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, `${db_slug} PDF URL was not found`, { db_slug, doc_id });
  }
  let response: Response;
  try {
    response = await fetch(resolved_url, {
      redirect: "follow",
      headers: {
        "Accept": "application/pdf,*/*;q=0.8",
        "User-Agent": "web-ai-capability-hub-literature-downloader/2.1.0"
      }
    });
  } catch (error) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `${db_slug} PDF fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      { db_slug, doc_id, url: resolved_url }
    );
  }
  if (!response.ok) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `${db_slug} PDF fetch returned HTTP ${response.status}`,
      { db_slug, doc_id, url: resolved_url, status: response.status }
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, `${db_slug} PDF download was empty`, { db_slug, doc_id, url: resolved_url });
  }
  ensureDir(output_dir);
  const target = downloadTargetPath(output_dir, doc_id);
  fs.writeFileSync(target, buffer);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const size = fs.statSync(target).size;
  return { path: target, sha256, size, downloaded_at: Date.now(), resolved_url };
}

export async function runLiteratureDownloadPdfTool(
  db_slug: string,
  args: Partial<LiteratureDownloadPdfArgs>,
  resolvePdfUrl: LiteraturePdfResolver,
  initialRequestedUrl?: LiteratureRequestedUrlResolver,
): Promise<LiteratureDownloadPdfOutput> {
  let docId: string;
  try {
    docId = requireDocId(args?.doc_id);
  } catch (error) {
    return literatureErrorOutput(error);
  }
  const now = Date.now();
  const quota = assertLiteratureQuota(db_slug, now);
  const requestedUrl = initialRequestedUrl?.(docId) || null;
  if (!quota.allowed) {
    const queued = enqueueLiteratureDownload(db_slug, docId, requestedUrl, now);
    return emptyOutput({
      ok: true,
      task_id: queued.task_id,
      errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
      message: `${db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
    });
  }
  try {
    const outputDir = defaultLiteratureOutputDir(db_slug, args?.output_dir);
    const result = await downloadLiteraturePdfToDisk(db_slug, docId, requestedUrl, outputDir, resolvePdfUrl);
    recordLiteratureDownload(db_slug, docId, result.path, result.sha256, result.resolved_url, result.downloaded_at);
    return emptyOutput({
      ok: true,
      path: result.path,
      sha256: result.sha256,
      size: result.size,
      downloaded_at: result.downloaded_at,
      message: "Literature PDF downloaded"
    });
  } catch (error) {
    return literatureErrorOutput(error);
  }
}

export function registerPdfLiteratureDriver(
  db_slug: string,
  resolvePdfUrl: LiteraturePdfResolver,
): void {
  registerLiteratureDriver(db_slug, async ({ doc_id, requested_url }) => {
    const outputDir = defaultLiteratureOutputDir(db_slug);
    const result = await downloadLiteraturePdfToDisk(db_slug, requireDocId(doc_id), requested_url, outputDir, resolvePdfUrl);
    return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
  });
}

const DB_SLUG = "arxiv";

export async function webAiArxivDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveArxivPdfUrl, resolveArxivPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveArxivPdfUrl);
