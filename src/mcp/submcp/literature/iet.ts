import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const ietPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "iet",
  display_name: "IET Digital Library",
  default_profile: "research-iet",
  selectors: [
    "a.pdf-link",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true
};

export async function webAiIetDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(ietPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(ietPaywalledLiteratureConfig);
