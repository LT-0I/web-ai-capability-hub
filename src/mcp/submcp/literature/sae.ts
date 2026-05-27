import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const saePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "sae",
  display_name: "SAE Mobilus",
  default_profile: "research-sae",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.PDFDownloadLink",
    "a[href*=\"download\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://www.sae.org/publications/technical-papers/content/${docId.replace(/^10\.4271\//, "")}` : null
};

export async function webAiSaeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(saePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(saePaywalledLiteratureConfig);
