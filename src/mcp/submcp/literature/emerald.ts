import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const emeraldPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "emerald",
  display_name: "Emerald Insight",
  default_profile: "research-emerald",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.intent_pdf_link",
    "a[href*=\"/full/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://www.emerald.com/insight/content/doi/${docId}/full/html` : null
};

export async function webAiEmeraldDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(emeraldPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(emeraldPaywalledLiteratureConfig);
