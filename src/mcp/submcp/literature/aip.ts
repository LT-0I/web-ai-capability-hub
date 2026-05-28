import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

function encodePathPreservingSlash(value: string): string {
  return String(value || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function doiFromValue(value: string): string | null {
  const raw = String(value || "").trim().replace(/^doi:\s*/i, "");
  if (/^10\.\S+\/\S+$/i.test(raw)) return raw.replace(/[),.;]+$/g, "");
  try {
    const url = new URL(raw);
    if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) {
      const doi = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      return /^10\.\S+\/\S+$/i.test(doi) ? doi.replace(/[),.;]+$/g, "") : null;
    }
    const haystack = decodeURIComponent(`${url.pathname}${url.search || ""}`);
    return /(?:^|[^\w.])(10\.\d{4,9}\/[^\s"'<>?#]+)/i.exec(haystack)?.[1]?.replace(/[),.;]+$/g, "") || null;
  } catch {
    return /(?:^|[^\w.])(10\.\d{4,9}\/[^\s"'<>?#]+)/i.exec(raw)?.[1]?.replace(/[),.;]+$/g, "") || null;
  }
}

function articleCandidatesForAip(docId: string, pdfUrl: string): string[] {
  const candidates: string[] = [];
  const requested = String(pdfUrl || "").trim();
  if (/^https:\/\/pubs\.aip\.org\/(?:[^?#]+\/)?article\//i.test(requested) && !/\/article-pdf\//i.test(requested)) {
    candidates.push(requested);
  }
  const doi = doiFromValue(docId) || doiFromValue(requested);
  if (doi) candidates.push(`https://doi.org/${encodePathPreservingSlash(doi)}`);
  return Array.from(new Set(candidates));
}

export const aipPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "aip",
  display_name: "AIP Publishing Scitation",
  default_profile: "research-aip",
  prefer_article_first: true,
  selectors: [
    "a[href*=\"/article-pdf/\" i]",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a[href*=\"/doi/pdf\" i]",
    "a[href*=\"/article-pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: articleCandidatesForAip
};

export async function webAiAipDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(aipPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(aipPaywalledLiteratureConfig);
