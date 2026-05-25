import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const apsPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "aps",
  display_name: "APS Journals",
  default_profile: "research-aps",
  selectors: [
    "a.btn-pdf",
    "a[href*=\"/pdf/\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiApsDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(apsPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(apsPaywalledLiteratureConfig);
