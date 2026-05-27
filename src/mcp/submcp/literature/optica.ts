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
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.article-pdf-link",
    "a[href*=\"fulltext.cfm\" i]",
    "a[href*=\"viewmedia.cfm\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^10\./.test(docId) ? `https://doi.org/${docId}` : null
};

export async function webAiOpticaDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(opticaPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(opticaPaywalledLiteratureConfig);
