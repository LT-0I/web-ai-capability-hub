import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const ieeePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "ieee",
  display_name: "IEEE Xplore",
  default_profile: "research-ieee",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a.xpl-btn-pdf",
    "a.doc-actions-link.pdf",
    "a.stats-document-lh-action-downloadPdf_2",
    "a[href*=\"stamp.jsp\" i]",
    "a[href*=\"stampPDF\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://doi.org/${docId}` : null
};

export async function webAiIeeeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(ieeePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(ieeePaywalledLiteratureConfig);
