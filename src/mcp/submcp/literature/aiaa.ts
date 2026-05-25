import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const aiaaPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "aiaa",
  display_name: "AIAA Aerospace Research Central",
  default_profile: "research-aiaa",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiAiaaDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(aiaaPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(aiaaPaywalledLiteratureConfig);
