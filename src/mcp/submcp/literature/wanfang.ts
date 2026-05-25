import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const wanfangPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "wanfang",
  display_name: "Wanfang Data",
  default_profile: "research-wanfang",
  selectors: [
    "a.downloadliterature",
    "a[href*=\"download\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_wanfang_get_metadata"
};

export async function webAiWanfangDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(wanfangPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(wanfangPaywalledLiteratureConfig);
