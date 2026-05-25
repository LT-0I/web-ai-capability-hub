import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const ascePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "asce",
  display_name: "ASCE Library",
  default_profile: "research-asce",
  selectors: [
    "a.pdf",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiAsceDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(ascePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(ascePaywalledLiteratureConfig);
