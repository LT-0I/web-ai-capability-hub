import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { encodePathPreservingSlash, LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "scielo";

export function resolveScieloPdfUrl(doc_id: string): string {
  const raw = String(doc_id || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw.includes("format=pdf") ? raw : `${raw}${raw.includes("?") ? "&" : "?"}format=pdf`;
  const cleaned = raw.replace(/^\/+/, "");
  const parts = cleaned.split(/[/:|]/).filter(Boolean);
  if (parts.length < 2) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SciELO doc_id must include both journal and article PID (for example csp/abc123)", { doc_id: raw });
  }
  const journal = parts[0];
  const pid = parts.slice(1).join("/");
  if (/^pid[A-Za-z0-9]+$/.test(pid)) return `https://www.scielo.br/j/${encodeURIComponent(journal)}/a/${encodePathPreservingSlash(pid)}/?lang=en&format=pdf`;
  return `https://www.scielo.br/j/${encodeURIComponent(journal)}/a/${encodePathPreservingSlash(pid)}/?format=pdf`;
}

export async function webAiScieloDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveScieloPdfUrl, (docId) => {
    try { return resolveScieloPdfUrl(docId); } catch { return null; }
  });
}

registerPdfLiteratureDriver(DB_SLUG, resolveScieloPdfUrl);
