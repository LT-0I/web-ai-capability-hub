import { encodePathPreservingSlash, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "mdpi";

function htmlDecode(value: string): string {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}

function mdpiPdfHrefFromHtml(html: string): string | null {
  const anchor = /<a\b(?=[^>]*class=["'][^"']*download-link[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*(?:data-cy|title|aria-label)=["'][^"']*pdf[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*href=["']([^"']*\/pdf(?:\?[^"']*)?)["'])[^>]*>/i.exec(html)?.[1];
  return anchor ? htmlDecode(anchor) : null;
}

function directMdpiPdfUrl(doc_id: string): string {
  const id = String(doc_id || "").trim().replace(/^\/+/, "");
  if (/^https?:\/\//i.test(id)) return /\/pdf(?:$|[?#])/i.test(id) ? id : `${id.replace(/\/$/, "")}/pdf`;
  return `https://www.mdpi.com/${encodePathPreservingSlash(id)}/pdf`;
}

export async function resolveMdpiPdfUrl(doc_id: string): Promise<string> {
  const directUrl = directMdpiPdfUrl(doc_id);
  const response = await fetch(directUrl, { headers: { "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8" } });
  const contentType = response.headers.get("content-type") || "";
  if (/application\/pdf/i.test(contentType)) return directUrl;
  const html = await response.text().catch(() => "");
  const href = mdpiPdfHrefFromHtml(html);
  return href ? new URL(href, directUrl).toString() : directUrl;
}

export async function webAiMdpiDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveMdpiPdfUrl);
}

registerPdfLiteratureDriver(DB_SLUG, resolveMdpiPdfUrl);
