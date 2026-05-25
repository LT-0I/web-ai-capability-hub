import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const tandfPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "tandf",
  display_name: "Taylor & Francis Online",
  default_profile: "research-tandf",
  selectors: [
    "a.show-pdf",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiTandfDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(tandfPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(tandfPaywalledLiteratureConfig);
