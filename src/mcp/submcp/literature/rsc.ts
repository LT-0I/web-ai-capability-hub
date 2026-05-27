import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const rscPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "rsc",
  display_name: "Royal Society of Chemistry",
  default_profile: "research-rsc",
  selectors: [
    "a.btn--pdf",
    "a[href*=\"/articlepdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true
};

export async function webAiRscDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(rscPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(rscPaywalledLiteratureConfig);
