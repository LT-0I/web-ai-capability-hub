import { encodePathPreservingSlash, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "frontiers";

export function resolveFrontiersPdfUrl(doc_id: string): string {
  const raw = String(doc_id || "").trim();
  if (/^https?:\/\//i.test(raw)) return /\/pdf(?:$|[?#])/i.test(raw) ? raw : `${raw.replace(/\/$/, "")}/pdf?download=`;
  const id = raw.replace(/^\/+/, "").replace(/\/pdf(?:\?download=?)?$/i, "");
  return `https://www.frontiersin.org/${encodePathPreservingSlash(id)}/pdf?download=`;
}

export async function webAiFrontiersDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveFrontiersPdfUrl, resolveFrontiersPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveFrontiersPdfUrl);
