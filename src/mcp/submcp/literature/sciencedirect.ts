import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const sciencedirectPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "sciencedirect",
  display_name: "ScienceDirect",
  default_profile: "research-sciencedirect",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a[data-aa-name*=\"pdf\" i]",
    "button[data-aa-name*=\"pdf\" i]",
    "a[data-testid*=\"pdf\" i]",
    "button[data-testid*=\"pdf\" i]",
    "a:has-text(\"PDF\")",
    "a.pdf-download-btn-link",
    "a.download-link",
    "a[href*=\"/pdfft\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string, pdfUrl: string) => {
    if (/^S\d+/i.test(docId)) return `https://www.sciencedirect.com/science/article/pii/${docId}`;
    if (/\/pdfft/i.test(pdfUrl)) return pdfUrl.replace(/\/pdfft(?:[?#].*)?$/i, "");
    return /^10\./.test(docId) ? `https://doi.org/${docId}` : null;
  }
};

function scienceDirectPiiFromDocId(docId: string): string | null {
  const raw = String(docId || "").trim();
  if (/^S\d+/i.test(raw)) return raw.replace(/\/pdfft(?:[?#].*)?$/i, "");
  const match = /\/science\/article\/pii\/(S\d+)/i.exec(raw);
  return match?.[1] || null;
}

function resolveScienceDirectPdfUrl(docId: string): string | null {
  const raw = String(docId || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const pii = scienceDirectPiiFromDocId(raw);
  return pii ? `https://www.sciencedirect.com/science/article/pii/${pii}/pdfft?isDTMRedir=true&download=true` : null;
}

function withResolvedScienceDirectPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  const docId = String(args?.doc_id || "").trim();
  if (!docId || args?.pdf_url) return args;
  const pdfUrl = resolveScienceDirectPdfUrl(docId);
  return pdfUrl ? { ...args, pdf_url: pdfUrl } : args;
}

function shouldSurfaceScienceDirectAccessGate(
  args: Partial<PaywalledLiteratureDownloadPdfArgs>,
  output: LiteratureDownloadPdfOutput
): boolean {
  if (output.ok || output.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND) return false;
  if (/PDF URL was not resolved|pass pdf_url/i.test(String(output.message || ""))) return false;
  const docId = String(args?.doc_id || "").trim();
  const pdfUrl = String(args?.pdf_url || "").trim();
  return !!resolveScienceDirectPdfUrl(docId) || /sciencedirect\.com\/science\/article\/pii\/S\d+/i.test(pdfUrl);
}

export async function webAiSciencedirectDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const prepared = withResolvedScienceDirectPdfUrl(args);
  const output = await runPaywalledLiteratureDownloadPdfTool(sciencedirectPaywalledLiteratureConfig, prepared);
  if (!shouldSurfaceScienceDirectAccessGate(prepared, output)) return output;
  return {
    ...output,
    errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
    message: `ScienceDirect institutional/browser access gate prevented verified PDF delivery; complete entitled access in profile "${String(prepared.profile || sciencedirectPaywalledLiteratureConfig.default_profile)}" and retry. ${output.message || ""}`.trim()
  };
}

registerPaywalledPdfLiteratureDriver(sciencedirectPaywalledLiteratureConfig);
