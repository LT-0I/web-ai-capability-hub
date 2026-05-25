import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const asmePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "asme",
  display_name: "ASME Digital Collection",
  default_profile: "research-asme",
  selectors: [
    "a.pdf-link",
    "a[href*=\"/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiAsmeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(asmePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(asmePaywalledLiteratureConfig);
