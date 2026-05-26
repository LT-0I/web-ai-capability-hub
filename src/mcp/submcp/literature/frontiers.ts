import { encodePathPreservingSlash, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "frontiers";

function stripArticleFullSuffix(value: string): string {
  const withoutFull = value.replace(/\/full\/?$/i, "");
  return /10\.3389\/[^/]+\.\d{4}\.\d{6,}$/i.test(withoutFull) ? withoutFull : value;
}

export function resolveFrontiersPdfUrl(doc_id: string): string {
  const raw = String(doc_id || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    if (/\/pdf(?:$|[?#])/i.test(raw)) return raw;
    return `${stripArticleFullSuffix(raw).replace(/\/$/, "")}/pdf?download=`;
  }
  const id = stripArticleFullSuffix(raw.replace(/^\/+/, "")).replace(/\/pdf(?:\?download=?)?$/i, "");
  if (/^10\.3389\//i.test(id)) return `https://www.frontiersin.org/articles/${encodePathPreservingSlash(id)}/pdf?download=`;
  return `https://www.frontiersin.org/${encodePathPreservingSlash(id)}/pdf?download=`;
}

export async function webAiFrontiersDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveFrontiersPdfUrl, resolveFrontiersPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveFrontiersPdfUrl);
