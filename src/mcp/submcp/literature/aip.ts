import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const aipPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "aip",
  display_name: "AIP Publishing Scitation",
  default_profile: "research-aip",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiAipDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(aipPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(aipPaywalledLiteratureConfig);
