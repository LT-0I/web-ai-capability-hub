import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const proquestPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "proquest",
  display_name: "ProQuest",
  default_profile: "research-proquest",
  selectors: [
    "a#downloadPDFLink",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a[href*=\"downloadPDF\" i]",
    "a[href*=\"fulltextPDF\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_proquest_get_metadata",
  article_url_resolver: (docId: string) => {
    const id = String(docId || "").trim().replace(/^central:/i, "");
    return /^\d+$/.test(id) ? `https://www.proquest.com/docview/${id}` : null;
  }
};

export async function webAiProquestDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(proquestPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(proquestPaywalledLiteratureConfig);
