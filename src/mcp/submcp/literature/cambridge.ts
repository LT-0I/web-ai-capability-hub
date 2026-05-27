import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const cambridgePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "cambridge",
  display_name: "Cambridge Core",
  default_profile: "research-cambridge",
  selectors: [
    "a.pdf",
    "a[href*=\"/services/aop-cambridge-core/content\" i][href*=\"/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true
};

export async function webAiCambridgeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(cambridgePaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(cambridgePaywalledLiteratureConfig);
