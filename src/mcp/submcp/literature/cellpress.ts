import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const cellpressPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "cellpress",
  display_name: "Cell Press",
  default_profile: "research-cellpress",
  selectors: [
    "a.show-pdf",
    "a[aria-label*=\"PDF\" i]",
    "a[href*=\"/pdf/\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiCellpressDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(cellpressPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(cellpressPaywalledLiteratureConfig);
