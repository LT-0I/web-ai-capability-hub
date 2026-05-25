import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, resolveArxivPdfUrl, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "inspirehep";

function arxivFromRecord(record: any): string | null {
  const candidates = [
    ...(Array.isArray(record?.metadata?.arxiv_eprints) ? record.metadata.arxiv_eprints : []),
    ...(Array.isArray(record?.arxiv_eprints) ? record.arxiv_eprints : [])
  ];
  const item = candidates.find((entry: any) => typeof entry?.value === "string" || typeof entry === "string");
  return typeof item === "string" ? item : item?.value || null;
}

function documentUrlFromRecord(record: any): string | null {
  const docs = [
    ...(Array.isArray(record?.metadata?.documents) ? record.metadata.documents : []),
    ...(Array.isArray(record?.documents) ? record.documents : [])
  ];
  const doc = docs.find((entry: any) => typeof entry?.url === "string" && /\.pdf(?:$|[?#])|pdf/i.test(entry.url)) || docs.find((entry: any) => typeof entry?.url === "string");
  return doc?.url || null;
}

export async function resolveInspirehepPdfUrl(doc_id: string): Promise<string | null> {
  const id = String(doc_id || "").trim().replace(/^https?:\/\/inspirehep\.net\/literature\//i, "");
  if (/^https?:\/\//i.test(id)) return id;
  const response = await fetch(`https://inspirehep.net/api/literature/${encodeURIComponent(id)}`, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, `INSPIREHEP record fetch returned HTTP ${response.status}`, { doc_id: id, status: response.status });
  const record = await response.json();
  const arxiv = arxivFromRecord(record);
  if (arxiv) return resolveArxivPdfUrl(arxiv);
  const documentUrl = documentUrlFromRecord(record);
  if (!documentUrl) throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "INSPIREHEP record did not expose arXiv or document PDF URL", { doc_id: id });
  return documentUrl;
}

export async function webAiInspirehepDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveInspirehepPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveInspirehepPdfUrl);
