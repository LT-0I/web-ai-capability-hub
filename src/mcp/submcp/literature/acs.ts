import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const acsPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "acs",
  display_name: "ACS Publications",
  default_profile: "research-acs",
  selectors: [
    "a.btn-pdf",
    "a[title*=\"PDF\" i]",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiAcsDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(acsPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(acsPaywalledLiteratureConfig);
