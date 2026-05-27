const fs = require("node:fs");
const path = require("node:path");
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { safeProfileName } from "../../../browser/profileStore";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { firstBrowserContext } from "../../../browser/managedPageRouting";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota } from "../../../runtime/literature/quota";
import { LiteratureDownloadError, LiteratureDownloadPdfOutput, defaultLiteratureOutputDir, literatureErrorOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  downloadPaywalledLiteraturePdfToDisk,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

const ASCE_ORIGIN = "https://ascelibrary.org";
const ASCE_DOI_PREFIX = /^10\.1061\//i;
const ASCE_MANUAL_LOGIN_MESSAGE = "Open the headed research-asce Chrome profile, confirm institutional ASCE Library PDF access, then re-run.";

function requireAsceDocId(docId: unknown): string {
  const value = String(docId || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function asOptionalUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function encodeAsceDoiPath(doi: string): string {
  return String(doi || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function asceDoiFromDocId(docId: string): string | null {
  const raw = String(docId || "").trim();
  if (ASCE_DOI_PREFIX.test(raw)) return raw;
  const url = asOptionalUrl(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)ascelibrary\.org$/i.test(parsed.hostname)) return null;
    const decodedPath = decodeURIComponent(parsed.pathname);
    const match = /\/doi\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\.1061\/[^?#]+)/i.exec(decodedPath);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function ascePdfUrlForDoi(doi: string, download = true): string {
  const query = download ? "?download=true" : "";
  return `${ASCE_ORIGIN}/doi/pdf/${encodeAsceDoiPath(doi)}${query}`;
}

function asceArticleUrlForDoi(doi: string): string {
  return `${ASCE_ORIGIN}/doi/${encodeAsceDoiPath(doi)}`;
}

function resolveAscePreferredPdfUrlOrNull(docId: string): string | null {
  const url = asOptionalUrl(docId);
  if (url && /\/doi\/pdf\//i.test(url)) return url;
  const doi = asceDoiFromDocId(docId);
  return doi ? ascePdfUrlForDoi(doi, true) : null;
}

function ascePdfAccessProbeUrl(pdfUrl: string): string {
  try {
    const parsed = new URL(pdfUrl);
    parsed.searchParams.delete("download");
    return parsed.toString();
  } catch {
    return pdfUrl;
  }
}

function asceArticleCandidates(docId: string): string[] | null {
  const doi = asceDoiFromDocId(docId);
  if (!doi) return null;
  return [
    ascePdfUrlForDoi(doi, true),
    ascePdfUrlForDoi(doi, false),
    `${ASCE_ORIGIN}/doi/full/${encodeAsceDoiPath(doi)}`,
    asceArticleUrlForDoi(doi)
  ];
}

function withResolvedAscePdfUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  if (args?.pdf_url) return args;
  const docId = String(args?.doc_id || "").trim();
  const pdfUrl = docId ? resolveAscePreferredPdfUrlOrNull(docId) : null;
  return pdfUrl ? { ...args, pdf_url: pdfUrl } : args;
}

function directoryHasExistingState(dir: string | undefined): boolean {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name: string) => name !== "DevToolsActivePort" && !name.startsWith("Singleton"));
  } catch {
    return false;
  }
}

function hasRegisteredOrExistingProfileState(launcher: any, profile: string): boolean {
  const record = launcher?.profileStore?.list?.().find((entry: any) => entry?.profileName === profile);
  if (directoryHasExistingState(record?.profileDir)) return true;
  const root = launcher?.profileStore?.profilesRoot;
  return directoryHasExistingState(root ? path.join(root, safeProfileName(profile)) : undefined);
}

async function connectAsceResearchBrowser(launcher: any, profile: string, cdpPort?: number): Promise<{ browser: any; externallyOwned: boolean }> {
  const hasProfileState = hasRegisteredOrExistingProfileState(launcher, profile);
  if (cdpPort && !hasProfileState) {
    const host = process.env.WAH_CDP_HOST || "127.0.0.1";
    return {
      browser: await launcher.connectOverCdp({
        profile,
        profileDir: "",
        cdpEndpoint: `http://${host}:${cdpPort}`,
        cdpPort,
        connected: true,
        launchedByPackage: false
      }),
      externallyOwned: true
    };
  }
  if (!hasProfileState) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.LOGIN_REQUIRED,
      `ASCE Library profile "${profile}" is not authenticated or initialized. ${ASCE_MANUAL_LOGIN_MESSAGE}`,
      { profile, profile_state: "missing" }
    );
  }
  const status = await launcher.launch({ profile, cdpPort });
  return { browser: await launcher.connectOverCdp(status), externallyOwned: !!cdpPort && !status?.launchedByPackage };
}

async function inspectAsceAccessState(page: any, response: any, pdfUrl: string): Promise<Record<string, unknown>> {
  const status = typeof response?.status === "function" ? response.status() : null;
  const responseUrl = typeof response?.url === "function" ? response.url() : pdfUrl;
  const headers = typeof response?.headers === "function" ? response.headers() : {};
  const dom = await page.evaluate(() => {
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const downloadPdfLinks = Array.from(document.querySelectorAll("a,button")).filter((el) => {
      const label = `${(el as HTMLElement).innerText || ""} ${el.getAttribute("href") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`;
      return visible(el) && /download\s+pdf|\/doi\/pdf\//i.test(label);
    }).map((el) => ({
      text: ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      href: (el as HTMLAnchorElement).href || el.getAttribute("href") || ""
    }));
    return {
      url: location.href,
      title: document.title,
      visibleText: text.slice(0, 1600),
      hasPasswordInput: !!document.querySelector("input[type='password']"),
      hasLoginText: /login|log in|sign in|institutional login|register|shibboleth|athens/i.test(text),
      hasGetAccess: /get access|access through your institution|purchase|subscribe|login\s*\/\s*register/i.test(text),
      hasAccessDenied: /access denial|access denied|no access|not have access|purchase options/i.test(text),
      antiBotLike: /just a moment|checking your browser|请稍候|captcha|enable javascript/i.test(`${document.title} ${text}`),
      downloadPdfLinks
    };
  }).catch(() => ({ url: page.url?.() || "", title: "", visibleText: "", downloadPdfLinks: [] }));
  return { status, responseUrl, contentType: String(headers?.["content-type"] || ""), ...dom };
}

function looksLikeAsceLoginRequired(state: Record<string, unknown>): boolean {
  const url = String(state.url || state.responseUrl || "");
  if (/\/login(?:[/?#]|$)|signin|saml|shibboleth|athens/i.test(url)) return true;
  if (state.hasPasswordInput) return true;
  const status = Number(state.status || 0);
  if (status === 401) return true;
  if (status === 403 && (state.hasGetAccess || state.hasLoginText || state.hasAccessDenied || !/application\/pdf/i.test(String(state.contentType || "")))) return true;
  return !!(state.hasAccessDenied && (state.hasGetAccess || state.hasLoginText));
}

async function ensureAsceProfileCanAccessPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<void> {
  const docId = requireAsceDocId(args?.doc_id);
  const pdfUrl = asOptionalUrl(args?.pdf_url) || resolveAscePreferredPdfUrlOrNull(docId);
  if (!pdfUrl || !/ascelibrary\.org\/doi\/pdf\//i.test(pdfUrl)) return;
  const preflightUrl = ascePdfAccessProbeUrl(pdfUrl);
  const profile = String(args?.profile || ascePaywalledLiteratureConfig.default_profile).trim();
  if (!profile) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "profile is required for ASCE downloads");
  const launcher = createManagedBrowserLauncher();
  let browser: any;
  let externallyOwned = false;
  let page: any;
  try {
    const connected = await connectAsceResearchBrowser(launcher, profile, args?.cdp_port);
    browser = connected.browser;
    externallyOwned = connected.externallyOwned;
    const context = await firstBrowserContext(browser);
    page = await context.newPage();
    const response = await page.goto(preflightUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/ERR_ABORTED|Download is starting/i.test(message)) return null;
      throw new LiteratureDownloadError(ConsumerErrorCodes.COMMAND_TIMEOUT, `ASCE Library PDF access preflight navigation failed: ${message}`, { pdf_url: pdfUrl, preflight_url: preflightUrl });
    });
    await page.waitForLoadState?.("networkidle", { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout?.(5000).catch(() => undefined);
    const state = await inspectAsceAccessState(page, response, preflightUrl);
    if (looksLikeAsceLoginRequired(state)) {
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.LOGIN_REQUIRED,
        `ASCE Library profile "${profile}" does not have PDF access for "${docId}". ${ASCE_MANUAL_LOGIN_MESSAGE}`,
        { profile, doc_id: docId, pdf_url: pdfUrl, preflight_url: preflightUrl, ...state }
      );
    }
  } catch (error) {
    if (error instanceof LiteratureDownloadError) throw error;
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.LOGIN_REQUIRED,
      `ASCE Library profile "${profile}" could not verify PDF access. ${ASCE_MANUAL_LOGIN_MESSAGE}`,
      { profile, doc_id: docId, pdf_url: pdfUrl, preflight_url: preflightUrl, cause: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    await page?.close?.({ runBeforeUnload: false }).catch(() => undefined);
    if (!externallyOwned) await browser?.close?.().catch(() => undefined);
  }
}

function asceQueuedOutputIfQuotaReached(args: Partial<PaywalledLiteratureDownloadPdfArgs>): LiteratureDownloadPdfOutput | null {
  const docId = String(args?.doc_id || "").trim();
  if (!docId) return null;
  const nowMs = Date.now();
  const quota = assertLiteratureQuota(ascePaywalledLiteratureConfig.db_slug, nowMs);
  if (quota.allowed) return null;
  const requestedUrl = asOptionalUrl(args?.pdf_url) || asOptionalUrl(docId);
  const queued = enqueueLiteratureDownload(ascePaywalledLiteratureConfig.db_slug, docId, requestedUrl, nowMs);
  return {
    ok: true,
    task_id: queued.task_id,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
    message: `${ascePaywalledLiteratureConfig.db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`,
    oa_source: "none"
  } as LiteratureDownloadPdfOutput;
}

export const ascePaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "asce",
  display_name: "ASCE Library",
  default_profile: "research-asce",
  selectors: [
    "#downloadPdfUrl",
    "a#downloadPdfUrl[href*=\"/doi/pdf/\" i]",
    "a[href*='download=true' i][href*='/doi/pdf/' i]",
    "a[href*='/doi/pdf/' i]",
    "a:has-text(\"Download PDF\")",
    "a[aria-label*='Download PDF' i]",
    "a[title*='Download PDF' i]",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.pdf",
    "a[href*=\"/article-pdf\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string) => asceArticleCandidates(docId),
  candidate_url_filter: (url: string, docId: string) => {
    const doi = asceDoiFromDocId(docId);
    if (!doi) return /ascelibrary\.org/i.test(url);
    const lowerUrl = decodeURIComponent(String(url || "")).toLowerCase();
    const lowerDoi = doi.toLowerCase();
    if (/citation|showcitformats|references|figure|table|recommend|metrics|crossmark/i.test(lowerUrl)) return false;
    return lowerUrl.includes(lowerDoi) || /\/doi\/pdf\//i.test(lowerUrl);
  }
};

export async function webAiAsceDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const prepared = withResolvedAscePdfUrl(args);
  const queued = asceQueuedOutputIfQuotaReached(prepared);
  if (queued) return queued;
  try {
    await ensureAsceProfileCanAccessPdf(prepared);
  } catch (error) {
    if (prepared.unpaywall_email) return runPaywalledLiteratureDownloadPdfTool(ascePaywalledLiteratureConfig, prepared);
    return { ...literatureErrorOutput(error), oa_source: "none" } as LiteratureDownloadPdfOutput & { oa_source: "none" };
  }
  return runPaywalledLiteratureDownloadPdfTool(ascePaywalledLiteratureConfig, prepared);
}

registerLiteratureDriver(ascePaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const docId = requireAsceDocId(doc_id);
  const outputDir = defaultLiteratureOutputDir(ascePaywalledLiteratureConfig.db_slug);
  const requestedUrl = requested_url || resolveAscePreferredPdfUrlOrNull(docId);
  await ensureAsceProfileCanAccessPdf({ doc_id: docId, pdf_url: requestedUrl || undefined, profile: ascePaywalledLiteratureConfig.default_profile });
  const result = await downloadPaywalledLiteraturePdfToDisk(
    ascePaywalledLiteratureConfig,
    docId,
    requestedUrl,
    outputDir,
    ascePaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
