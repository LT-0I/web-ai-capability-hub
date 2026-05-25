import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const iestPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "iest",
  display_name: "Journal of the IEST",
  default_profile: "research-iest",
  selectors: [
    "a[href*=\"pdf\" i]",
    "a[href*=\"download\" i]",
    "a[aria-label*=\"PDF\" i]"
  ],
  metadata_tool: null
};

export async function webAiIestDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(iestPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(iestPaywalledLiteratureConfig);
