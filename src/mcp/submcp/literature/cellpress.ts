import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const cellpressPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "cellpress",
  display_name: "Cell Press",
  default_profile: "research-cellpress",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.show-pdf",
    "a[href*=\"/pdf/\" i]",
    "a[href*=\"/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: (docId: string) => /^S\d/i.test(docId) ? `https://www.cell.com/cell-reports/fulltext/${docId}` : null
};

export async function webAiCellpressDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(cellpressPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(cellpressPaywalledLiteratureConfig);
