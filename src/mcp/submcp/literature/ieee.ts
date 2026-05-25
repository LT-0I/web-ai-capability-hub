import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const ieeePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "ieee",
  display_name: "IEEE Xplore",
  default_profile: "research-ieee",
  selectors: [
    "a.stats-document-lh-action-downloadPdf_2",
    "a[href*=\"stampPDF\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiIeeeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(ieeePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(ieeePaywalledLiteratureConfig);
