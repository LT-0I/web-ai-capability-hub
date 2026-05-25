import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "pubscholar";

function htmlDecode(value: string): string {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}

function pageUrlFor(doc_id: string): string {
  const id = String(doc_id || "").trim();
  if (/^https?:\/\//i.test(id)) return id;
  return `https://pubscholar.cn/${id.replace(/^\/+/, "")}`;
}

function pdfHrefFromHtml(html: string): string | null {
  const dataPdf = /data-pdf-url=["']([^"']+)["']/i.exec(html)?.[1];
  if (dataPdf) return htmlDecode(dataPdf);
  const anchor = /<a\b(?=[^>]*class=["'][^"']*pdf-download[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'])[^>]*>/i.exec(html)?.[1];
  return anchor ? htmlDecode(anchor) : null;
}

export async function resolvePubscholarPdfUrl(doc_id: string): Promise<string | null> {
  const pageUrl = pageUrlFor(doc_id);
  const response = await fetch(pageUrl, { headers: { "Accept": "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, `PubScholar article page returned HTTP ${response.status}`, { doc_id, status: response.status, url: pageUrl });
  const html = await response.text();
  const href = pdfHrefFromHtml(html);
  if (!href) throw new LiteratureDownloadError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, "PubScholar PDF link was not found in article page", { doc_id, url: pageUrl });
  return new URL(href, pageUrl).toString();
}

export async function webAiPubscholarDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolvePubscholarPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolvePubscholarPdfUrl);
