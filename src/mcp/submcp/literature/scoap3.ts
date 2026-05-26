import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "scoap3";

function fileUrlFromRecord(record: any): string | null {
  const candidates = [
    ...(Array.isArray(record?.files) ? record.files : []),
    ...(Array.isArray(record?.metadata?.files) ? record.metadata.files : []),
    ...(Array.isArray(record?.metadata?._files) ? record.metadata._files : []),
    ...(Array.isArray(record?.metadata?.documents) ? record.metadata.documents : []),
    ...(Array.isArray(record?.documents) ? record.documents : [])
  ];
  const urlFor = (item: any): string | null => item?.url || item?.file || (item?.key ? `https://scoap3-prod-backend.s3.cern.ch/media/${item.key}` : null);
  const first = candidates.find((item: any) => {
    const candidate = urlFor(item);
    return typeof candidate === "string" && /\.pdf(?:$|[?#])|pdf/i.test(candidate);
  }) || candidates.find((item: any) => typeof urlFor(item) === "string");
  return first ? urlFor(first) : null;
}

export async function resolveScoap3PdfUrl(doc_id: string): Promise<string | null> {
  const id = String(doc_id || "").trim();
  if (/^https?:\/\//i.test(id)) return id;
  const response = await fetch(`https://repo.scoap3.org/api/records/${encodeURIComponent(id)}`, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, `SCOAP3 record fetch returned HTTP ${response.status}`, { doc_id: id, status: response.status });
  const record = await response.json();
  const url = fileUrlFromRecord(record);
  if (!url) throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "SCOAP3 record did not contain files[0].url", { doc_id: id });
  return url;
}

function requestedUrl(doc_id: string): string | null {
  return /^https?:\/\//i.test(doc_id) ? doc_id : null;
}

export async function webAiScoap3DownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveScoap3PdfUrl, requestedUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveScoap3PdfUrl);
