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
    "a.pdf-download-btn-link",
    "a[href*=\"/pdfft\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiSciencedirectDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(sciencedirectPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(sciencedirectPaywalledLiteratureConfig);
