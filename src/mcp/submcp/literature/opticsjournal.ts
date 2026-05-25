import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const opticsjournalPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "opticsjournal",
  display_name: "Opticsjournal 中国激光平台",
  default_profile: "research-opticsjournal",
  selectors: [
    "a.pdfdown",
    "a[href*=\"pdf\" i]",
    "a[href*=\"download\" i]"
  ],
  metadata_tool: null
};

export async function webAiOpticsjournalDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(opticsjournalPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(opticsjournalPaywalledLiteratureConfig);
