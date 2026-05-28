import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const siamPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "siam",
  display_name: "SIAM Publications",
  default_profile: "research-siam",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.pdf",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"/doi/epdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://epubs.siam.org/doi/${docId}` : null
};

export async function webAiSiamDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(siamPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(siamPaywalledLiteratureConfig);
