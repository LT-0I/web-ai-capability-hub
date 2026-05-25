import { encodePathPreservingSlash, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "mdpi";

export function resolveMdpiPdfUrl(doc_id: string): string {
  const id = String(doc_id || "").trim().replace(/^\/+/, "");
  if (/^https?:\/\//i.test(id)) return /\/pdf(?:$|[?#])/i.test(id) ? id : `${id.replace(/\/$/, "")}/pdf`;
  return `https://www.mdpi.com/${encodePathPreservingSlash(id)}/pdf`;
}

export async function webAiMdpiDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveMdpiPdfUrl, resolveMdpiPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveMdpiPdfUrl);
