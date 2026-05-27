import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

function encodeOpticaPath(value: string): string {
  return String(value || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function uniqueOpticaUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function opticaUriFromValue(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const uri = parsed.searchParams.get("uri") || parsed.searchParams.get("URI");
      if (uri && /^[a-z]+-\d+-\d+-\d+$/i.test(uri)) return uri.toLowerCase();
    } catch {
      return null;
    }
  }
  const normalized = raw.replace(/^optica:/i, "").trim();
  return /^[a-z]+-\d+-\d+-\d+$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function opticaDoiFromDocId(docId: string): string | null {
  const normalized = String(docId || "").trim().replace(/^doi:/i, "");
  return /^10\.\S+\/\S+$/i.test(normalized) ? normalized : null;
}

function opticaJournalFromUri(uri: string): string {
  return uri.split("-")[0] || "ol";
}

function opticaArticleUrlCandidates(docId: string, pdfUrl: string): string[] {
  const uri = opticaUriFromValue(docId) || opticaUriFromValue(pdfUrl);
  const doi = opticaDoiFromDocId(docId);
  const urls: Array<string | null> = [];
  if (uri) {
    const journal = opticaJournalFromUri(uri);
    urls.push(
      `https://opg.optica.org/${journal}/abstract.cfm?uri=${encodeURIComponent(uri)}`,
      `https://opg.optica.org/${journal}/viewmedia.cfm?uri=${encodeURIComponent(uri)}&seq=0`,
      `https://opg.optica.org/viewmedia.cfm?uri=${encodeURIComponent(uri)}&seq=0`,
      `https://opg.optica.org/${journal}/fulltext.cfm?uri=${encodeURIComponent(uri)}`
    );
  }
  if (doi) urls.push(`https://doi.org/${encodeOpticaPath(doi)}`);
  return uniqueOpticaUrls(urls);
}

function opticaDefaultPdfUrl(docId: string): string | null {
  if (/^https?:\/\//i.test(String(docId || "").trim())) return null;
  const uri = opticaUriFromValue(docId);
  if (uri) {
    const journal = opticaJournalFromUri(uri);
    return `https://opg.optica.org/${journal}/viewmedia.cfm?uri=${encodeURIComponent(uri)}&seq=0`;
  }
  return null;
}

function opticaCandidateUrlAllowed(url: string, docId: string, contextUrl: string): boolean {
  if (/\/captcha(?:\/|\?|$)/i.test(url)) return false;
  const expectedUri = opticaUriFromValue(docId) || opticaUriFromValue(contextUrl);
  const candidateUri = opticaUriFromValue(url);
  if (expectedUri && candidateUri && candidateUri !== expectedUri) return false;
  try {
    const parsed = new URL(url);
    if (!/(\.|^)opg\.optica\.org$/i.test(parsed.hostname)) return false;
    if (/\.(?:css|js|png|jpe?g|gif|svg|woff2?|ico)(?:$|[?#])/i.test(parsed.pathname)) return false;
  } catch {
    return false;
  }
  return true;
}

function withOpticaDefaultPdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  if (args?.pdf_url || !args?.doc_id) return args;
  const pdfUrl = opticaDefaultPdfUrl(args.doc_id);
  return pdfUrl ? { ...args, pdf_url: pdfUrl } : args;
}

function opticaLoginRequiredMessage(args: Partial<PaywalledLiteratureDownloadPdfArgs>): string {
  const profile = String(args?.profile || opticaPaywalledLiteratureConfig.default_profile);
  const uri = opticaUriFromValue(args?.doc_id) || opticaUriFromValue(args?.pdf_url);
  const manualUrl = uri ? `https://opg.optica.org/${opticaJournalFromUri(uri)}/abstract.cfm?uri=${encodeURIComponent(uri)}` : "https://opg.optica.org/";
  return `Optica captcha/login clearance is required for this browser profile. Open ${manualUrl} in the ${profile} profile manually, clear the captcha once, then cookies persist; rerun webai_optica_download_pdf.`;
}

function shouldSurfaceOpticaLoginRequired(output: LiteratureDownloadPdfOutput, args: Partial<PaywalledLiteratureDownloadPdfArgs>): boolean {
  if (output.ok) return false;
  if (output.errorCode !== ConsumerErrorCodes.ELEMENT_NOT_FOUND && output.errorCode !== ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT) return false;
  if (/get_metadata|pass pdf_url|PDF URL was not resolved/i.test(output.message || "")) return false;
  const input = `${args?.doc_id || ""} ${args?.pdf_url || ""}`;
  return /opg\.optica\.org|(?:^|\s)optica:|[a-z]+-\d+-\d+-\d+|10\.1364\//i.test(input);
}

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
  prefer_article_first: true,
  article_url_resolver: opticaArticleUrlCandidates,
  candidate_url_filter: opticaCandidateUrlAllowed
};

export async function webAiOpticaDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const effectiveArgs = withOpticaDefaultPdfUrl(args);
  const output = await runPaywalledLiteratureDownloadPdfTool(opticaPaywalledLiteratureConfig, effectiveArgs);
  if (!shouldSurfaceOpticaLoginRequired(output, effectiveArgs)) return output;
  return {
    ...output,
    errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
    message: opticaLoginRequiredMessage(effectiveArgs)
  };
}

registerPaywalledPdfLiteratureDriver(opticaPaywalledLiteratureConfig);
