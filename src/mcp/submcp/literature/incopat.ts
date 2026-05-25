import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { LiteratureDownloadError, LiteratureDownloadPdfOutput, defaultLiteratureOutputDir, encodePathPreservingSlash } from "./arxiv";
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
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_incopat_get_metadata"
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

export async function webAiIncopatDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(incopatPaywalledLiteratureConfig, withResolvedIncopatPdfUrl(args));
}

registerLiteratureDriver(incopatPaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const outputDir = defaultLiteratureOutputDir(incopatPaywalledLiteratureConfig.db_slug);
  const result = await downloadPaywalledLiteraturePdfToDisk(
    incopatPaywalledLiteratureConfig,
    doc_id,
    requested_url || resolveIncopatPdfUrl(doc_id),
    outputDir,
    incopatPaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
