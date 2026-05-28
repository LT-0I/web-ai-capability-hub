import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota } from "../../../runtime/literature/quota";
import { LiteratureDownloadError, LiteratureDownloadPdfOutput, defaultLiteratureOutputDir, encodePathPreservingSlash, literatureErrorOutput } from "./arxiv";
import { ensureIncopatIpLoginForProfile } from "./incopat-auth";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  downloadPaywalledLiteraturePdfToDisk,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const incopatPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "incopat",
  display_name: "IncoPat",
  default_profile: "research-incopat",
  selectors: [
    "a[href*=\"/pdf\" i]",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_incopat_get_metadata",
  prefer_article_first: true,
  article_url_resolver: (docId: string) => {
    const id = String(docId || "").trim().replace(/^incopat:\s*/i, "").replace(/^patent\//i, "").replace(/\/pdf(?:[?#].*)?$/i, "");
    return id ? `https://www.incopat.com/patent/${encodeURIComponent(id)}` : null;
  }
};

function patentIdFromDocId(docId: string): string {
  const id = String(docId || "")
    .trim()
    .replace(/^incopat:\s*/i, "")
    .replace(/^patent\//i, "")
    .replace(/^https?:\/\/(?:www\.)?incopat\.com\/patent\//i, "")
    .replace(/\/pdf(?:[?#].*)?$/i, "");
  if (!id) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return id;
}

export function resolveIncopatPdfUrl(docId: string): string {
  const raw = String(docId || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.incopat.com/patent/${encodePathPreservingSlash(patentIdFromDocId(raw))}/pdf`;
}

function withResolvedIncopatPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  const docId = String(args?.doc_id || "").trim();
  if (!docId || args?.pdf_url) return args;
  return { ...args, pdf_url: resolveIncopatPdfUrl(docId) };
}

function incopatQueuedOutputIfQuotaReached(args: Partial<PaywalledLiteratureDownloadPdfArgs>): LiteratureDownloadPdfOutput | null {
  const docId = String(args?.doc_id || "").trim();
  if (!docId) return null;
  const nowMs = Date.now();
  const quota = assertLiteratureQuota(incopatPaywalledLiteratureConfig.db_slug, nowMs);
  if (quota.allowed) return null;
  const requestedUrl = /^https?:\/\//i.test(String(args?.pdf_url || "")) ? String(args?.pdf_url)
    : /^https?:\/\//i.test(docId) ? docId
    : null;
  const queued = enqueueLiteratureDownload(incopatPaywalledLiteratureConfig.db_slug, docId, requestedUrl, nowMs);
  return {
    ok: true,
    task_id: queued.task_id,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
    message: `${incopatPaywalledLiteratureConfig.db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`,
    oa_source: "none"
  } as LiteratureDownloadPdfOutput & { oa_source: "none" };
}

async function ensureIncopatDownloadAuthenticated(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<void> {
  const profile = String(args?.profile || incopatPaywalledLiteratureConfig.default_profile).trim();
  if (!profile) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "profile is required for IncoPat downloads");
  try {
    await ensureIncopatIpLoginForProfile(profile, args?.cdp_port);
  } catch (error) {
    if (error instanceof LiteratureDownloadError && error.errorCode === ConsumerErrorCodes.ELEMENT_NOT_FOUND) {
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.LOGIN_REQUIRED,
        `IncoPat authenticated campus-IP session is required for PDF delivery; profile "${profile}" did not expose a usable IP-login control`,
        { profile, db_slug: incopatPaywalledLiteratureConfig.db_slug, cause: error.message }
      );
    }
    throw error;
  }
}

export async function webAiIncopatDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const prepared = withResolvedIncopatPdfUrl(args);
  const queued = incopatQueuedOutputIfQuotaReached(prepared);
  if (queued) return queued;
  try {
    await ensureIncopatDownloadAuthenticated(prepared);
  } catch (error) {
    return { ...literatureErrorOutput(error), oa_source: "none" } as LiteratureDownloadPdfOutput & { oa_source: "none" };
  }
  return runPaywalledLiteratureDownloadPdfTool(incopatPaywalledLiteratureConfig, prepared);
}

registerLiteratureDriver(incopatPaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const outputDir = defaultLiteratureOutputDir(incopatPaywalledLiteratureConfig.db_slug);
  await ensureIncopatIpLoginForProfile(incopatPaywalledLiteratureConfig.default_profile);
  const result = await downloadPaywalledLiteraturePdfToDisk(
    incopatPaywalledLiteratureConfig,
    doc_id,
    requested_url || resolveIncopatPdfUrl(doc_id),
    outputDir,
    incopatPaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
