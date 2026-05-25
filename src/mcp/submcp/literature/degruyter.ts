import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const degruyterPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "degruyter",
  display_name: "De Gruyter Brill",
  default_profile: "research-degruyter",
  selectors: [
    "a.download-pdf",
    "a[href*=\"/document/doi/\" i][href*=\"/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiDegruyterDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(degruyterPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(degruyterPaywalledLiteratureConfig);
