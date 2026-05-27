import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

export const wanfangPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "wanfang",
  display_name: "Wanfang Data",
  default_profile: "research-wanfang",
  selectors: [
    "a.downloadliterature",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"下载全文\")",
    "a:has-text(\"PDF\")",
    "a[href*=\"download\" i]"
  ],
  metadata_tool: "research_wanfang_get_metadata",
  article_url_resolver: (docId: string) => {
    const id = String(docId || "").trim().replace(/^wanfang:\s*/i, "");
    return id ? `https://d.wanfangdata.com.cn/periodical/${encodeURIComponent(id)}` : null;
  },
  candidate_url_filter: (url: string, docId: string) => {
    const id = String(docId || "").trim().replace(/^wanfang:\s*/i, "").toLowerCase();
    const lower = String(url || "").toLowerCase();
    if (/\/www\/file\/wfdatazs\.pdf\b/i.test(lower)) return false;
    return !id || lower.includes(id) || lower.includes("/periodical/") || lower.includes("download");
  }
};

export async function webAiWanfangDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(wanfangPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(wanfangPaywalledLiteratureConfig);
