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
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.pdfdown",
    "a[href*=\"download\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string, pdfUrl: string) => asOpticsjournalArticleUrl(docId, pdfUrl)
};

function asOpticsjournalArticleUrl(docId: string, pdfUrl: string): string | null {
  if (/^https?:\/\//i.test(pdfUrl)) return pdfUrl.replace(/\/PDF(?:[?#].*)?$/i, "/FullText");
  return /^10\./.test(docId) ? `https://doi.org/${docId}` : null;
}

export async function webAiOpticsjournalDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(opticsjournalPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(opticsjournalPaywalledLiteratureConfig);
