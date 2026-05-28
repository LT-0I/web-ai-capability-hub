import { encodePathPreservingSlash, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, runLiteratureDownloadPdfTool, registerPdfLiteratureDriver } from "./arxiv";

const DB_SLUG = "mdpi";
const MDPI_JOURNAL_SLUG_BY_ISSN: Record<string, string> = {
  "2076-3417": "applsci",
  "2504-446X": "drones"
};

function htmlDecode(value: string): string {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}

function mdpiPdfHrefFromHtml(html: string): string | null {
  const anchor = /<a\b(?=[^>]*id=["']js-button-download["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*class=["'][^"']*(?:download-link|UD_ArticlePDF)[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*(?:data-cy|title|aria-label)=["'][^"']*pdf[^"']*["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*href=["']([^"']+)["'])[^>]*>[\s\S]{0,120}?\bDownload\s+PDF\b[\s\S]{0,120}?<\/a>/i.exec(html)?.[1]
    || /<a\b(?=[^>]*href=["']([^"']*\/pdf(?:\?[^"']*)?)["'])[^>]*>/i.exec(html)?.[1];
  return anchor ? htmlDecode(anchor) : null;
}

function directMdpiPdfUrl(doc_id: string): string {
  const id = String(doc_id || "").trim().replace(/^\/+/, "");
  if (/^https?:\/\//i.test(id)) return /\/pdf(?:$|[?#])/i.test(id) ? id : `${id.replace(/\/$/, "")}/pdf`;
  return `https://www.mdpi.com/${encodePathPreservingSlash(id)}/pdf`;
}

function staticMdpiResourcePdfUrl(doc_id: string): string | null {
  const id = String(doc_id || "").trim().replace(/^https?:\/\/(?:www\.)?mdpi\.com\//i, "").replace(/^\/+/, "").replace(/\/pdf(?:[?#].*)?$/i, "");
  const [issn, volume, issue, article] = id.split("/");
  const journalSlug = MDPI_JOURNAL_SLUG_BY_ISSN[issn];
  if (!journalSlug || !volume || !article || !/^\d+$/.test(volume) || !/^\d+$/.test(article)) return null;
  const articleSlug = `${journalSlug}-${volume}-${article.padStart(5, "0")}`;
  return `https://mdpi-res.com/d_attachment/${journalSlug}/${articleSlug}/article_deploy/${articleSlug}.pdf`;
}

export async function resolveMdpiPdfUrl(doc_id: string): Promise<string> {
  const directUrl = directMdpiPdfUrl(doc_id);
  const response = await fetch(directUrl, { headers: { "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8" } });
  const contentType = response.headers.get("content-type") || "";
  if (/application\/pdf/i.test(contentType)) return directUrl;
  const html = await response.text().catch(() => "");
  const href = mdpiPdfHrefFromHtml(html);
  if (href) return new URL(href, directUrl).toString();
  return staticMdpiResourcePdfUrl(doc_id) || directUrl;
}

export async function webAiMdpiDownloadPdf(args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runLiteratureDownloadPdfTool(DB_SLUG, args, resolveMdpiPdfUrl, undefined, "research-mdpi");
}

registerPdfLiteratureDriver(DB_SLUG, resolveMdpiPdfUrl, "research-mdpi");
