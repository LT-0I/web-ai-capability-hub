import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const royalsocPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "royalsoc",
  display_name: "Royal Society Publishing",
  default_profile: "research-royalsoc",
  selectors: [
    "a.PdfLink",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiRoyalsocDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(royalsocPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(royalsocPaywalledLiteratureConfig);
