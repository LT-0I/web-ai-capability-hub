import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const naturePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "nature",
  display_name: "Nature",
  default_profile: "research-nature",
  selectors: [
    "a[data-track-action=\"download pdf\"]",
    "a[href$=\".pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiNatureDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(naturePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(naturePaywalledLiteratureConfig);
