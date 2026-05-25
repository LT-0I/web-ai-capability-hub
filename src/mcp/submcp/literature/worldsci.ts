import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { LiteratureDownloadError, LiteratureDownloadPdfOutput, defaultLiteratureOutputDir, encodePathPreservingSlash } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  downloadPaywalledLiteraturePdfToDisk,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const worldsciPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "worldsci",
  display_name: "World Scientific",
  default_profile: "research-worldsci",
  selectors: [
    "a[data-track*=\"pdf\" i]",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_worldsci_get_metadata"
};

function doiFromDocId(docId: string): string {
  const doi = String(docId || "")
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^https?:\/\/(?:www\.)?worldscientific\.com\/doi\/pdf\//i, "");
  if (!doi) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return doi;
}

export function resolveWorldsciPdfUrl(docId: string): string {
  const raw = String(docId || "").trim();
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/(?:dx\.)?doi\.org\//i.test(raw)) return raw;
  return `https://www.worldscientific.com/doi/pdf/${encodePathPreservingSlash(doiFromDocId(raw))}`;
}

function withResolvedWorldsciPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  const docId = String(args?.doc_id || "").trim();
  if (!docId || args?.pdf_url) return args;
  return { ...args, pdf_url: resolveWorldsciPdfUrl(docId) };
}

export async function webAiWorldsciDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(worldsciPaywalledLiteratureConfig, withResolvedWorldsciPdfUrl(args));
}

registerLiteratureDriver(worldsciPaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const outputDir = defaultLiteratureOutputDir(worldsciPaywalledLiteratureConfig.db_slug);
  const result = await downloadPaywalledLiteraturePdfToDisk(
    worldsciPaywalledLiteratureConfig,
    doc_id,
    requested_url || resolveWorldsciPdfUrl(doc_id),
    outputDir,
    worldsciPaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
