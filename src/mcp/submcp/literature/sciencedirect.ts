import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const sciencedirectPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "sciencedirect",
  display_name: "ScienceDirect",
  default_profile: "research-sciencedirect",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.pdf-download-btn-link",
    "a.download-link",
    "a[href*=\"/pdfft\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string, pdfUrl: string) => {
    if (/^S\d+/i.test(docId)) return `https://www.sciencedirect.com/science/article/pii/${docId}`;
    if (/\/pdfft/i.test(pdfUrl)) return pdfUrl.replace(/\/pdfft(?:[?#].*)?$/i, "");
    return /^10\./.test(docId) ? `https://doi.org/${docId}` : null;
  }
};

export async function webAiSciencedirectDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(sciencedirectPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(sciencedirectPaywalledLiteratureConfig);
