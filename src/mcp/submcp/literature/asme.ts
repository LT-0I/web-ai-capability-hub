import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const asmePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "asme",
  display_name: "ASME Digital Collection",
  default_profile: "research-asme",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.pdf-link",
    "a[href*=\"/article-pdf\" i]",
    "a[href*=\"/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://doi.org/${docId}` : null
};

export async function webAiAsmeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(asmePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(asmePaywalledLiteratureConfig);
