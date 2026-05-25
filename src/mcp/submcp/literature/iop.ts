import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const iopPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "iop",
  display_name: "IOPscience",
  default_profile: "research-iop",
  selectors: [
    "a.btn-pdf",
    "a[href$=\"/pdf\" i]",
    "a[href*=\"/pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiIopDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(iopPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(iopPaywalledLiteratureConfig);
