import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const springerPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "springer",
  display_name: "SpringerLink",
  default_profile: "research-springer",
  selectors: [
    "a.c-pdf-download__link",
    "a[href*=\"/content/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true
};

export async function webAiSpringerDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(springerPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(springerPaywalledLiteratureConfig);
