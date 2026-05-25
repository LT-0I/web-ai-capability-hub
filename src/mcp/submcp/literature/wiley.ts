import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const wileyPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "wiley",
  display_name: "Wiley Online Library",
  default_profile: "research-wiley",
  selectors: [
    "a.pdf-button",
    "a[href*=\"/doi/pdfdirect\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiWileyDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(wileyPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(wileyPaywalledLiteratureConfig);
