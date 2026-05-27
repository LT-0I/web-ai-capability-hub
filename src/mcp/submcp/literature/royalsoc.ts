import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const royalsocPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "royalsoc",
  display_name: "Royal Society Publishing",
  default_profile: "research-royalsoc",
  selectors: [
    "a[href*=\"/article-pdf/doi/10.1098/\" i]",
    "a[href*=\"/doi/pdf/10.1098/\" i]",
    "a[href*=\"/doi/10.1098/\" i]",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.PdfLink",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  prefer_article_first: true,
  article_url_resolver: (docId: string, pdfUrl: string) => {
    const doi = extractRoyalsocDoi(docId) || extractRoyalsocDoi(pdfUrl);
    return doi ? [
      `https://royalsocietypublishing.org/doi/pdf/${doi}`,
      `https://royalsocietypublishing.org/doi/${doi}`
    ] : null;
  }
};

export const royalsocRsosHuntUrl = "https://royalsocietypublishing.org/toc/rsos/current";

function extractRoyalsocDoi(value: string): string | null {
  const decoded = safeDecodeURIComponent(String(value || "").trim());
  const match = /10\.1098\/[A-Za-z0-9_.-]+/i.exec(decoded);
  return match?.[0] || null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function webAiRoyalsocDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(royalsocPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(royalsocPaywalledLiteratureConfig);
