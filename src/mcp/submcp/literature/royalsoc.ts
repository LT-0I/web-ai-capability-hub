import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const royalsocPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "royalsoc",
  display_name: "Royal Society Publishing",
  default_profile: "research-royalsoc",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.PdfLink",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://royalsocietypublishing.org/doi/${docId}` : null
};

export async function webAiRoyalsocDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(royalsocPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(royalsocPaywalledLiteratureConfig);
