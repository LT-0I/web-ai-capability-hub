import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { LiteratureDownloadError, LiteratureDownloadPdfOutput, defaultLiteratureOutputDir, encodePathPreservingSlash } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  downloadPaywalledLiteraturePdfToDisk,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const acmPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "acm",
  display_name: "ACM Digital Library",
  default_profile: "research-acm",
  selectors: [
    "a.btn-pdf",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_acm_get_metadata"
};

function doiFromDocId(docId: string): string {
  const doi = String(docId || "")
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^https?:\/\/dl\.acm\.org\/doi\/pdf\//i, "");
  if (!doi) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return doi;
}

export function resolveAcmPdfUrl(docId: string): string {
  const raw = String(docId || "").trim();
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/(?:dx\.)?doi\.org\//i.test(raw)) return raw;
  return `https://dl.acm.org/doi/pdf/${encodePathPreservingSlash(doiFromDocId(raw))}`;
}

function withResolvedAcmPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  const docId = String(args?.doc_id || "").trim();
  if (!docId || args?.pdf_url) return args;
  return { ...args, pdf_url: resolveAcmPdfUrl(docId) };
}

export async function webAiAcmDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(acmPaywalledLiteratureConfig, withResolvedAcmPdfUrl(args));
}

registerLiteratureDriver(acmPaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const outputDir = defaultLiteratureOutputDir(acmPaywalledLiteratureConfig.db_slug);
  const result = await downloadPaywalledLiteraturePdfToDisk(
    acmPaywalledLiteratureConfig,
    doc_id,
    requested_url || resolveAcmPdfUrl(doc_id),
    outputDir,
    acmPaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
