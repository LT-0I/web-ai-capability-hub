import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const proquestPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "proquest",
  display_name: "ProQuest",
  default_profile: "research-proquest",
  selectors: [
    "a#downloadPDFLink",
    "a[href*=\"downloadPDF\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_proquest_get_metadata"
};

export async function webAiProquestDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(proquestPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(proquestPaywalledLiteratureConfig);
