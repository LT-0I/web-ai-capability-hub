import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

const SAE_TECHNICAL_PAPER_ID = /\b\d{4}-\d{2}-\d{4}\b/i;

function cleanSaeDocId(value: unknown): string {
  return String(value || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
}

function saeTechnicalPaperId(value: unknown): string | null {
  const raw = cleanSaeDocId(value);
  if (!raw) return null;
  const doiId = /^10\.4271\/([^\s/]+)$/i.exec(raw)?.[1];
  if (doiId && SAE_TECHNICAL_PAPER_ID.test(doiId)) return doiId;
  try {
    const url = new URL(raw);
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    const contentId = /\/content\/([^/]+)$/i.exec(path)?.[1];
    if (contentId && SAE_TECHNICAL_PAPER_ID.test(contentId)) return contentId;
    const paperId = SAE_TECHNICAL_PAPER_ID.exec(path)?.[0];
    if (paperId) return paperId;
  } catch {
    // Not a URL; continue with plain-id parsing.
  }
  const plainId = SAE_TECHNICAL_PAPER_ID.exec(raw)?.[0];
  return plainId || null;
}

function saeDownloadUrl(id: string): string {
  return `https://www.sae.org/publications/technical-papers/content/${encodeURIComponent(id)}/download`;
}

function saeArticleUrlCandidates(docId: string, pdfUrl: string): string[] {
  const id = saeTechnicalPaperId(docId) || saeTechnicalPaperId(pdfUrl);
  if (!id) return /^10\./.test(docId) ? [`https://doi.org/${docId}`] : [];
  return [
    saeDownloadUrl(id),
    `https://saemobilus.sae.org/content/${encodeURIComponent(id)}/download`,
    `https://saemobilus.sae.org/content/${encodeURIComponent(id)}`,
    `https://www.sae.org/publications/technical-papers/content/${encodeURIComponent(id)}`
  ];
}

function withSaeDownloadUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  if (args?.pdf_url) return args;
  const id = saeTechnicalPaperId(args?.doc_id);
  return id ? { ...args, pdf_url: saeDownloadUrl(id) } : args;
}

function saeLoginRequiredOutput(result: LiteratureDownloadPdfOutput, args: Partial<PaywalledLiteratureDownloadPdfArgs>): LiteratureDownloadPdfOutput {
  if (result.ok) return result;
  const id = saeTechnicalPaperId(args?.doc_id) || saeTechnicalPaperId(args?.pdf_url);
  if (!id || ![ConsumerErrorCodes.ELEMENT_NOT_FOUND, ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED].includes(result.errorCode as any)) {
    return result;
  }
  return {
    ...result,
    errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
    message: `SAE Technical Papers PDF access is subscription-gated for ${id}; the SAE /download route did not return a verified %PDF artifact. Setup: launch headed Chrome profile "research-sae", sign in to SAE Mobilus or connect an institutional SAE Technical Papers subscription, then retry with the same technical paper id.`
  };
}

export const saePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "sae",
  display_name: "SAE Technical Papers",
  default_profile: "research-sae",
  selectors: [
    "button[aria-label*=\"Download\" i]",
    "button:has-text(\"file_download\")",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.PDFDownloadLink",
    "a[href*=\"download\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: saeArticleUrlCandidates,
  prefer_article_first: true
};

export async function webAiSaeDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const saeArgs = withSaeDownloadUrl(args);
  return saeLoginRequiredOutput(await runPaywalledLiteratureDownloadPdfTool(saePaywalledLiteratureConfig, saeArgs), saeArgs);
}

registerPaywalledPdfLiteratureDriver(saePaywalledLiteratureConfig);
