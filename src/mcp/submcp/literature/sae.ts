import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const saePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "sae",
  display_name: "SAE Mobilus",
  default_profile: "research-sae",
  selectors: [
    "a.PDFDownloadLink",
    "a[href*=\"pdf\" i]",
    "a[href*=\"download\" i]"
  ],
  metadata_tool: null
};

export async function webAiSaeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(saePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(saePaywalledLiteratureConfig);
