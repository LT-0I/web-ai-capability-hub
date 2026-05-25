import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const crcPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "crc",
  display_name: "CRC Press / Taylor & Francis",
  default_profile: "research-crc",
  selectors: [
    "a.pdf",
    "a[href*=\"full-pdf-download\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_crc_get_metadata"
};

export async function webAiCrcDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(crcPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(crcPaywalledLiteratureConfig);
