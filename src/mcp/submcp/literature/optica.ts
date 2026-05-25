import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const opticaPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "optica",
  display_name: "Optica Publishing Group",
  default_profile: "research-optica",
  selectors: [
    "a.article-pdf-link",
    "a[href*=\"fulltext.cfm\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null
};

export async function webAiOpticaDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(opticaPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(opticaPaywalledLiteratureConfig);
