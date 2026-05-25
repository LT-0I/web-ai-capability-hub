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
    "a.pdf",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiSiamDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(siamPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(siamPaywalledLiteratureConfig);
