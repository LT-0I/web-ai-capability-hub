const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota, recordLiteratureDownload } from "../../../runtime/literature/quota";
import { safeFilename } from "../../../utils/paths";
import { defaultLiteratureOutputDir, LiteratureDownloadError, LiteratureDownloadPdfOutput, literatureErrorOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

function directIestPdfUrl(value: string): string | null {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.hostname !== "jiest.kglmeridian.com") return null;
    if (/^\/downloadpdf\/view\/journals\/jiet\/.+article-p\d+\.pdf$/i.test(url.pathname)) return url.toString();
    const match = /^\/view\/journals\/jiet\/(.+\/article-p\d+)\.xml$/i.exec(url.pathname);
    if (!match) return null;
    url.pathname = `/downloadpdf/view/journals/jiet/${match[1]}.pdf`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function articleCandidatesForIest(docId: string, pdfUrl: string): string[] {
  return Array.from(new Set([
    directIestPdfUrl(pdfUrl),
    directIestPdfUrl(docId),
    /^https?:\/\//i.test(String(pdfUrl || "")) ? String(pdfUrl).trim() : null
  ].filter((url): url is string => !!url)));
}

function resolveIestPdfUrl(docId: string): string | null {
  return directIestPdfUrl(docId);
}

function requireDocId(doc_id: unknown): string {
  const value = String(doc_id || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function httpsGetBuffer(url: string, redirects = 0): Promise<{ buffer: Buffer; resolved_url: string; content_type: string; status: number }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: 30000,
      headers: {
        "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 web-ai-capability-hub/2.2.0"
      }
    }, (response: any) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers?.location;
      if (location && status >= 300 && status < 400 && redirects < 5) {
        response.resume();
        resolve(httpsGetBuffer(new URL(location, url).toString(), redirects + 1));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        resolved_url: response.responseUrl || url,
        content_type: String(response.headers?.["content-type"] || ""),
        status
      }));
    });
    request.on("timeout", () => request.destroy(new Error("timed out after 30000ms")));
    request.on("error", reject);
  });
}

async function downloadPublicIestPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>, directPdf: string): Promise<LiteratureDownloadPdfOutput> {
  let docId: string;
  try {
    docId = requireDocId(args?.doc_id);
  } catch (error) {
    return literatureErrorOutput(error);
  }
  const now = Date.now();
  const quota = assertLiteratureQuota(iestPaywalledLiteratureConfig.db_slug, now);
  if (!quota.allowed) {
    const queued = enqueueLiteratureDownload(iestPaywalledLiteratureConfig.db_slug, docId, directPdf, now);
    return {
      ok: true,
      task_id: queued.task_id,
      path: null,
      sha256: null,
      size: null,
      downloaded_at: null,
      errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
      message: `${iestPaywalledLiteratureConfig.db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
    };
  }
  try {
    const fetched = await httpsGetBuffer(directPdf);
    if (fetched.status < 200 || fetched.status >= 300) {
      throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT, `PDF fetch returned HTTP ${fetched.status}`, { url: directPdf, resolved_url: fetched.resolved_url });
    }
    if (Buffer.from(fetched.buffer.subarray(0, 5)).toString("utf8") !== "%PDF-") {
      throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "iest download did not produce a PDF artifact", { url: directPdf, content_type: fetched.content_type });
    }
    const outputDir = defaultLiteratureOutputDir(iestPaywalledLiteratureConfig.db_slug, args?.output_dir);
    const target = path.resolve(outputDir, `${safeFilename(docId).replace(/\.pdf$/i, "")}.pdf`);
    fs.writeFileSync(target, fetched.buffer);
    const sha256 = crypto.createHash("sha256").update(fetched.buffer).digest("hex");
    const downloadedAt = Date.now();
    recordLiteratureDownload(iestPaywalledLiteratureConfig.db_slug, docId, target, sha256, fetched.resolved_url, downloadedAt);
    return {
      ok: true,
      task_id: null,
      path: target,
      sha256,
      size: fetched.buffer.length,
      downloaded_at: downloadedAt,
      errorCode: null,
      message: "Literature PDF downloaded"
    };
  } catch (error) {
    return literatureErrorOutput(error);
  }
}

export const iestPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "iest",
  display_name: "Journal of the IEST",
  default_profile: "research-iest",
  prefer_article_first: true,
  selectors: [
    "a[href*=\"/downloadpdf/\" i]",
    "a[href*=\"pdf\" i]",
    "a[href*=\"download\" i]",
    "a[aria-label*=\"PDF\" i]"
  ],
  metadata_tool: null,
  article_url_resolver: articleCandidatesForIest,
  candidate_url_filter: (url: string) => /jiest\.kglmeridian\.com\/(?:downloadpdf\/)?view\/journals\/jiet\//i.test(url)
};

export async function webAiIestDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const directPdf = directIestPdfUrl(String(args?.pdf_url || "")) || directIestPdfUrl(String(args?.doc_id || ""));
  if (directPdf) {
    return downloadPublicIestPdf(args, directPdf);
  }
  return runPaywalledLiteratureDownloadPdfTool(iestPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(iestPaywalledLiteratureConfig);
