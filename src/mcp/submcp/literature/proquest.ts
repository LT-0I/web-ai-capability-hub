const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { safeProfileName } from "../../../browser/profileStore";
import { firstBrowserContext } from "../../../browser/managedPageRouting";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { enqueueLiteratureDownload } from "../../../runtime/literature/queue";
import { assertLiteratureQuota, recordLiteratureDownload } from "../../../runtime/literature/quota";
import { ensureDir, safeFilename } from "../../../utils/paths";
import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  defaultLiteratureOutputDir,
  LiteratureDownloadError,
  LiteratureDownloadedPdf,
  literatureErrorOutput
} from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs
} from "./paywalled";

export const proquestPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "proquest",
  display_name: "ProQuest",
  default_profile: "research-proquest",
  selectors: [
    "a#downloadPDFLink",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a[href*=\"downloadPDF\" i]",
    "a[href*=\"fulltextPDF\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: "research_proquest_get_metadata",
  prefer_article_first: true,
  article_url_resolver: (docId: string, pdfUrl: string) => proquestArticleUrls(docId, pdfUrl)
};

interface ProquestPdfCapture {
  buffer: Buffer;
  url: string;
}

type ProquestDownloadPdfOutput = LiteratureDownloadPdfOutput & { oa_source: "publisher" | "none" };

function now(): number { return Date.now(); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function emptyOutput(overrides: Partial<ProquestDownloadPdfOutput>): ProquestDownloadPdfOutput {
  return {
    ok: false,
    task_id: null,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: null,
    message: null,
    oa_source: "none",
    ...overrides
  };
}

function errorOutput(error: unknown): ProquestDownloadPdfOutput {
  return { ...literatureErrorOutput(error), oa_source: "none" };
}

function requireDocId(doc_id: unknown): string {
  const value = String(doc_id || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function asOptionalUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function proquestDocviewId(value: unknown): string | null {
  const raw = String(value || "").trim();
  const fromUrl = /\/docview\/(\d+)/i.exec(raw)?.[1];
  if (fromUrl) return fromUrl;
  const stripped = raw.replace(/^central:/i, "");
  return /^\d+$/.test(stripped) ? stripped : null;
}

function proquestArticleUrls(docId: string, pdfUrl?: string | null): string[] {
  const id = proquestDocviewId(docId) || proquestDocviewId(pdfUrl);
  return uniqueUrls([
    asOptionalUrl(pdfUrl),
    asOptionalUrl(docId),
    id ? `https://www.proquest.com/docview/${id}` : null,
    id ? `https://www.proquest.com/docview/${id}/fulltextPDF` : null
  ]);
}

function requestedProquestUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>, docId: string): string | null {
  return asOptionalUrl(args?.pdf_url) || asOptionalUrl(docId) || proquestArticleUrls(docId)[0] || null;
}

function unresolvedProquestPdfUrlError(docId: string): LiteratureDownloadError {
  return new LiteratureDownloadError(
    ConsumerErrorCodes.ELEMENT_NOT_FOUND,
    `ProQuest PDF URL was not resolved for doc_id "${docId}"; research_proquest_get_metadata is not present in this build, so pass pdf_url (or use a /docview/<id> URL, central:<id>, or numeric docview id as doc_id) to use the authenticated browser-session driver`,
    { db_slug: "proquest", doc_id: docId, metadata_tool: "research_proquest_get_metadata", fallback: "pdf_url" }
  );
}

function safePdfBasename(docId: string): string {
  const doiSlashSanitized = String(docId || "").replace(/[\\/]+/g, "_");
  return `${safeFilename(doiSlashSanitized).replace(/\.pdf$/i, "")}.pdf`;
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isPdfBuffer(buffer: Buffer | null | undefined): boolean {
  return !!buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString() === "%PDF-";
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

async function connectResearchBrowser(launcher: any, profile: string, cdpPort?: number): Promise<any> {
  const hasProfileState = hasRegisteredOrExistingProfileState(launcher, profile);
  if (cdpPort && !hasProfileState) {
    const host = process.env.WAH_CDP_HOST || "127.0.0.1";
    return launcher.connectOverCdp({
      profile,
      profileDir: "",
      cdpEndpoint: `http://${host}:${cdpPort}`,
      cdpPort,
      connected: true,
      launchedByPackage: false
    });
  }
  if (!hasProfileState) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.PROFILE_NOT_FOUND,
      `Authenticated research browser profile "${profile}" is not registered or initialized; refusing to spawn a fresh logged-out Chrome for paywalled literature download`,
      { profile }
    );
  }
  const status = await launcher.launch({ profile, cdpPort });
  return launcher.connectOverCdp(status);
}

async function gotoInspectable(page: any, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Timeout .*navigating|Navigation timeout|Timeout \d+ms exceeded|ERR_ABORTED|Download is starting/i.test(message)) throw error;
  }
  await page.waitForLoadState?.("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
  await page.waitForLoadState?.("networkidle", { timeout: 8000 }).catch(() => undefined);
  await sleep(1000);
}

async function dismissProquestChrome(page: any): Promise<void> {
  for (const selector of [
    "#onetrust-accept-btn-handler",
    "button:has-text(\"Accept All\")",
    "button:has-text(\"全部接受\")",
    "._pendo-close-guide",
    "#pendo-close-guide",
    "[aria-label=\"Close\"]"
  ]) {
    await page.locator?.(selector).first?.().click?.({ timeout: 1200 }).catch(() => undefined);
  }

  const restore = page.locator?.("#restoresession_confirm").first?.();
  if (!restore || !(await restore.count?.().catch(() => 0))) return;
  if (!(await restore.isVisible?.({ timeout: 500 }).catch(() => false))) return;
  for (const selector of [
    "#restoresession_confirm button:has-text(\"Start new session\")",
    "#restoresession_confirm a:has-text(\"Start new session\")",
    "#restoresession_confirm button:has-text(\"New session\")",
    "#restoresession_confirm a:has-text(\"New session\")",
    "#restoresession_confirm button:has-text(\"继续\")",
    "#restoresession_confirm a:has-text(\"继续\")",
    "#restoresession_confirm button:has-text(\"新会话\")",
    "#restoresession_confirm a:has-text(\"新会话\")",
    "#restoresession_confirm [data-dismiss=\"modal\"]",
    "#restoresession_confirm button.close",
    "#restoresession_confirm button",
    "#restoresession_confirm a"
  ]) {
    const control = page.locator?.(selector).first?.();
    if (!control || !(await control.count?.().catch(() => 0))) continue;
    await control.click?.({ timeout: 2000 }).catch(() => undefined);
    await sleep(1000);
    break;
  }
}

async function readPageEvidence(page: any): Promise<{ url: string; title: string; body: string }> {
  const [title, body] = await Promise.all([
    page.title?.().catch(() => ""),
    page.evaluate?.(() => (document.body?.innerText || "").replace(/\s+/g, " ").trim()).catch(() => "")
  ]);
  return { url: page.url?.() || "", title, body };
}

function hasAuthenticatedInstitution(evidence: { title: string; url: string; body: string }): boolean {
  return /访问权限提供者|Access\s+provided\s+by|NANJING UNIVERSITY OF AERONAUTICS AND ASTRONAUTICS/i.test(`${evidence.title} ${evidence.url} ${evidence.body}`);
}

function hasLoginWall(evidence: { title: string; url: string; body: string }): boolean {
  const haystack = `${evidence.title} ${evidence.url} ${evidence.body}`;
  return !hasAuthenticatedInstitution(evidence)
    && /login|log\s*in|sign\s*in|institutional\s+login|Shibboleth|OpenAthens|find\s+your\s+institution|choose\s+your\s+institution|登录|登入|请先登录|认证|身份验证/i.test(haystack);
}

function hasUnavailableDocument(evidence: { title: string; url: string; body: string }): boolean {
  return /Document unavailable|文档不可用|订阅内容不包括此文档|document may not be available|not available through your library/i.test(`${evidence.title} ${evidence.url} ${evidence.body}`);
}

function throwIfProquestAccessBlocked(evidence: { title: string; url: string; body: string }, docId: string): void {
  if (hasLoginWall(evidence)) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.LOGIN_REQUIRED,
      `ProQuest institutional session is required for PDF delivery; launch headed Chrome with profile "research-proquest", complete your library/SSO login at https://www.proquest.com/, then retry webai_proquest_download_pdf with the same profile`,
      { db_slug: "proquest", doc_id: docId, url: evidence.url, title: evidence.title }
    );
  }
  if (hasUnavailableDocument(evidence)) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      `ProQuest document "${docId}" is unavailable to the authenticated institution/session; use an accessible /docview/<id> result or complete ProQuest SSO for an entitled institution before retrying`,
      { db_slug: "proquest", doc_id: docId, url: evidence.url, title: evidence.title }
    );
  }
}

function startProquestPdfCapture(context: any): { wait: (timeoutMs: number) => Promise<ProquestPdfCapture | null>; stop: () => void; diagnostics: Array<{ url: string; status: number; content_type: string }> } {
  const captures: ProquestPdfCapture[] = [];
  const pending = new Set<Promise<void>>();
  const diagnostics: Array<{ url: string; status: number; content_type: string }> = [];
  const onResponse = (response: any) => {
    const url = String(response?.url?.() || "");
    if (!/^(?:https?:\/\/(?:[^/]+\.)?proquest\.com\/|https?:\/\/media\.proquest\.com\/)/i.test(url)) return;
    const headers = response.headers?.() || {};
    const contentType = String(headers["content-type"] || headers["Content-Type"] || "");
    const likelyPdf = /application\/pdf/i.test(contentType) || /media\.proquest\.com\/media\/|fulltextPDF|downloadpdf|pdf/i.test(url);
    if (!likelyPdf) return;
    diagnostics.push({ url, status: Number(response.status?.() || 0), content_type: contentType });
    const task = Promise.resolve()
      .then(async () => {
        const body = Buffer.from(await response.body());
        if (isPdfBuffer(body)) captures.push({ buffer: body, url });
      })
      .catch(() => undefined)
      .finally(() => pending.delete(task));
    pending.add(task);
  };
  context.on?.("response", onResponse);
  return {
    wait: async (timeoutMs: number): Promise<ProquestPdfCapture | null> => {
      const deadline = now() + timeoutMs;
      while (now() < deadline) {
        if (captures[0]) return captures[0];
        if (pending.size) await Promise.race([...pending, sleep(250)]).catch(() => undefined);
        else await sleep(250);
      }
      return captures[0] || null;
    },
    stop: () => context.off?.("response", onResponse),
    diagnostics
  };
}

async function directFetchPdfCandidate(context: any, url: string): Promise<ProquestPdfCapture | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const response = await context.request?.get?.(url, {
    timeout: 60000,
    headers: { Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8" }
  } as any).catch(() => null);
  if (!response?.ok?.()) return null;
  const buffer = Buffer.from(await response.body());
  return isPdfBuffer(buffer) ? { buffer, url: String(response.url?.() || url) } : null;
}

async function proquestPdfHrefCandidates(page: any, docId: string, resolvedUrl: string): Promise<string[]> {
  const pageUrl = String(page.url?.() || resolvedUrl);
  const hrefs: string[] = await page.evaluate?.(() => Array.from(document.querySelectorAll("a[href],iframe[src],embed[src],object[data]")).map((el) => {
    const raw = el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("data") || "";
    try { return raw ? new URL(raw, location.href).href : ""; } catch { return ""; }
  }).filter(Boolean)).catch(() => []);
  const id = proquestDocviewId(docId) || proquestDocviewId(pageUrl) || proquestDocviewId(resolvedUrl);
  return uniqueUrls([
    ...hrefs.filter((url) => /fulltextPDF|downloadpdf|media\.proquest\.com\/media\//i.test(url)),
    id ? `https://www.proquest.com/docview/${id}/fulltextPDF` : null,
    id ? `https://www.proquest.com/docview/${id}/fulltextPDF?accountid=16605` : null
  ]);
}

async function clickProquestPdfControl(page: any, capture: { wait: (timeoutMs: number) => Promise<ProquestPdfCapture | null> }): Promise<ProquestPdfCapture | null> {
  for (const selector of [
    "a#downloadPDFLink",
    "a#addFlashPageParameterformat_fulltextPDF",
    "a[href*=\"/fulltextPDF/\" i]",
    "a[href*=\"/fulltextPDF\" i]",
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a:has-text(\"全文\")",
    "a:has-text(\"下载\")"
  ]) {
    const locator = page.locator?.(selector).first?.();
    if (!locator || !(await locator.count?.().catch(() => 0))) continue;
    await locator.scrollIntoViewIfNeeded?.({ timeout: 3000 }).catch(() => undefined);
    const downloadPromise = page.waitForEvent?.("download", { timeout: 15000 }).catch(() => null);
    await locator.click?.({ timeout: 10000 }).catch(() => undefined);
    const captured = await capture.wait(45000);
    if (captured) return captured;
    const download = await downloadPromise;
    const downloadPath = await download?.path?.().catch(() => null);
    if (downloadPath && fs.existsSync(downloadPath)) {
      const buffer = fs.readFileSync(downloadPath);
      if (isPdfBuffer(buffer)) return { buffer, url: String(download.url?.() || page.url?.() || "") };
    }
  }
  return null;
}

function writeCapturedPdf(outputDir: string, docId: string, captured: ProquestPdfCapture): LiteratureDownloadedPdf {
  ensureDir(outputDir);
  const target = path.resolve(outputDir, safePdfBasename(docId));
  fs.writeFileSync(target, captured.buffer);
  const size = fs.statSync(target).size;
  if (size <= 0 || !isPdfBuffer(fs.readFileSync(target))) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.ARTIFACT_VERIFICATION_FAILED, "ProQuest PDF response did not produce a valid PDF artifact", { path: target, resolved_url: captured.url });
  }
  return { path: target, sha256: sha256File(target), size, downloaded_at: now(), resolved_url: captured.url };
}

export async function downloadProquestPdfToDisk(
  doc_id: string,
  pdf_url: string | null,
  output_dir: string,
  profile?: string,
  cdp_port?: number
): Promise<LiteratureDownloadedPdf> {
  const docId = requireDocId(doc_id);
  const resolvedUrl = asOptionalUrl(pdf_url) || proquestArticleUrls(docId)[0] || null;
  if (!resolvedUrl) throw unresolvedProquestPdfUrlError(docId);

  const outputDir = ensureDir(path.resolve(output_dir));
  const selectedProfile = String(profile || proquestPaywalledLiteratureConfig.default_profile || "research-proquest").trim();
  if (!selectedProfile) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "profile is required for ProQuest PDF downloads");

  const launcher = createManagedBrowserLauncher();
  let browser: any;
  let page: any;
  let capture: ReturnType<typeof startProquestPdfCapture> | null = null;
  try {
    browser = await connectResearchBrowser(launcher, selectedProfile, cdp_port);
    const context = await firstBrowserContext(browser);
    capture = startProquestPdfCapture(context);
    page = await context.newPage();
    const attemptedUrls = uniqueUrls([...proquestArticleUrls(docId, resolvedUrl), resolvedUrl]);
    let sawLoginWall = false;
    let lastEvidence: { title: string; url: string; body: string } | null = null;

    for (const url of attemptedUrls) {
      await gotoInspectable(page, url);
      await dismissProquestChrome(page);
      lastEvidence = await readPageEvidence(page);
      sawLoginWall = sawLoginWall || hasLoginWall(lastEvidence);
      throwIfProquestAccessBlocked(lastEvidence, docId);

      const directCapture = await capture.wait(5000);
      if (directCapture) return writeCapturedPdf(outputDir, docId, directCapture);

      const directFetch = await directFetchPdfCandidate(context, page.url?.() || url);
      if (directFetch) return writeCapturedPdf(outputDir, docId, directFetch);

      const clickedCapture = await clickProquestPdfControl(page, capture);
      if (clickedCapture) return writeCapturedPdf(outputDir, docId, clickedCapture);

      for (const candidateUrl of await proquestPdfHrefCandidates(page, docId, resolvedUrl)) {
        const fetched = await directFetchPdfCandidate(context, candidateUrl);
        if (fetched) return writeCapturedPdf(outputDir, docId, fetched);
        if (candidateUrl === page.url?.()) continue;
        await gotoInspectable(page, candidateUrl);
        await dismissProquestChrome(page);
        lastEvidence = await readPageEvidence(page);
        sawLoginWall = sawLoginWall || hasLoginWall(lastEvidence);
        throwIfProquestAccessBlocked(lastEvidence, docId);
        const navigatedCapture = await capture.wait(10000);
        if (navigatedCapture) return writeCapturedPdf(outputDir, docId, navigatedCapture);
        const candidateClicked = await clickProquestPdfControl(page, capture);
        if (candidateClicked) return writeCapturedPdf(outputDir, docId, candidateClicked);
      }
    }

    if (sawLoginWall) {
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.LOGIN_REQUIRED,
        `ProQuest institutional session is required for PDF delivery; launch headed Chrome with profile "research-proquest", complete your library/SSO login at https://www.proquest.com/, then retry webai_proquest_download_pdf with the same profile`,
        { db_slug: "proquest", doc_id: docId, url: lastEvidence?.url }
      );
    }
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      "ProQuest PDF response was not found after docview/fulltextPDF navigation and PDF control click",
      { db_slug: "proquest", doc_id: docId, pdf_url: resolvedUrl, attempted_urls: attemptedUrls, pdf_responses: capture?.diagnostics.slice(-20) || [] }
    );
  } catch (error) {
    if (error instanceof LiteratureDownloadError) throw error;
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ARTIFACT_DOWNLOAD_TIMEOUT,
      `ProQuest browser-session PDF download failed: ${error instanceof Error ? error.message : String(error)}`,
      { db_slug: "proquest", doc_id: docId, pdf_url: resolvedUrl }
    );
  } finally {
    capture?.stop();
    await page?.close?.({ runBeforeUnload: false }).catch(() => undefined);
    await browser?.close?.().catch(() => undefined);
  }
}

export async function webAiProquestDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  let docId: string;
  try {
    docId = requireDocId(args?.doc_id);
  } catch (error) {
    return errorOutput(error);
  }

  const nowMs = now();
  const quota = assertLiteratureQuota("proquest", nowMs);
  const requestedUrl = requestedProquestUrl(args, docId);
  if (!quota.allowed) {
    const queued = enqueueLiteratureDownload("proquest", docId, requestedUrl, nowMs);
    return emptyOutput({
      ok: true,
      task_id: queued.task_id,
      errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
      message: `proquest literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
    });
  }

  try {
    if (!requestedUrl) throw unresolvedProquestPdfUrlError(docId);
    const outputDir = defaultLiteratureOutputDir("proquest", args?.output_dir);
    const result = await downloadProquestPdfToDisk(docId, requestedUrl, outputDir, args?.profile, args?.cdp_port);
    recordLiteratureDownload("proquest", docId, result.path, result.sha256, result.resolved_url, result.downloaded_at);
    return emptyOutput({
      ok: true,
      path: result.path,
      sha256: result.sha256,
      size: result.size,
      downloaded_at: result.downloaded_at,
      oa_source: "publisher",
      message: "Literature PDF downloaded"
    });
  } catch (error) {
    return errorOutput(error);
  }
}

registerLiteratureDriver("proquest", async ({ doc_id, requested_url }) => {
  const outputDir = defaultLiteratureOutputDir("proquest");
  const result = await downloadProquestPdfToDisk(requireDocId(doc_id), requested_url || requestedProquestUrl({ doc_id }, doc_id), outputDir, proquestPaywalledLiteratureConfig.default_profile);
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
