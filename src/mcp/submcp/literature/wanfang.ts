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

const WANFANG_ARTICLE_ORIGIN = "https://d.wanfangdata.com.cn";
const WANFANG_MANUAL_LOGIN_MESSAGE = "Run `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority PROFILES=research-wanfang scripts/launch-web-ais.sh launch`, log in manually, then re-run.";

function requireWanfangDocId(docId: unknown): string {
  const value = String(docId || "").trim();
  if (!value) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "doc_id is required");
  return value;
}

function stripWanfangPrefix(docId: string): string {
  return String(docId || "").trim().replace(/^wanfang:\s*/i, "");
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

function wanfangArticleParts(docId: string): { resourcePath: string; id: string } | null {
  const raw = stripWanfangPrefix(docId).replace(/^https?:\/\/d\.wanfangdata\.com\.cn\//i, "");
  const urlMatch = /^(periodical|thesis|conference|patent)\/([^/?#]+)/i.exec(raw);
  if (urlMatch) return { resourcePath: urlMatch[1].toLowerCase(), id: decodeURIComponent(urlMatch[2]) };
  const typed = /^(Periodical|Thesis|Conference|Patent)_([^/?#]+)$/i.exec(raw);
  if (typed) return { resourcePath: typed[1].toLowerCase(), id: typed[2] };
  return null;
}

function wanfangArticleId(docId: string): string {
  return wanfangArticleParts(docId)?.id.toLowerCase() || stripWanfangPrefix(docId).toLowerCase();
}

function resolveWanfangArticleUrlOrNull(docId: string): string | null {
  const raw = stripWanfangPrefix(requireWanfangDocId(docId));
  if (/^https?:\/\//i.test(raw)) return raw;
  const parts = wanfangArticleParts(raw);
  if (!parts) return null;
  return `${WANFANG_ARTICLE_ORIGIN}/${parts.resourcePath}/${encodeURIComponent(parts.id)}`;
}

export function resolveWanfangArticleUrl(docId: string): string {
  const articleUrl = resolveWanfangArticleUrlOrNull(docId);
  if (!articleUrl) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      `Wanfang PDF URL was not resolved for doc_id "${docId}"; research_wanfang_get_metadata is not present in this build, so pass pdf_url (or use a URL as doc_id) to use the authenticated browser-session driver`,
      { db_slug: "wanfang", doc_id: docId, metadata_tool: "research_wanfang_get_metadata", fallback: "pdf_url" }
    );
  }
  return articleUrl;
}

function withResolvedWanfangArticleUrl(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Partial<PaywalledLiteratureDownloadPdfArgs> {
  const docId = String(args?.doc_id || "").trim();
  if (!docId || args?.pdf_url) return args;
  const articleUrl = resolveWanfangArticleUrlOrNull(docId);
  return articleUrl ? { ...args, pdf_url: articleUrl } : args;
}

function looksLikeWanfangLoginRequired(state: Record<string, unknown>): boolean {
  const url = String(state.url || "");
  if (/\/login(?:[/?#]|$)|passport\.wanfangdata\.com\.cn|login\.wanfangdata\.com\.cn/i.test(url)) return true;
  if (state.hasPasswordInput || state.hasLoginForm) return true;
  const text = String(state.visibleText || "");
  return /(?:账号|手机号|用户名).{0,20}(?:密码|验证码)|微信扫码登录|机构账号登录|登录后/.test(text) && !state.hasDownloadLink;
}

async function inspectWanfangAuthState(page: any): Promise<Record<string, unknown>> {
  return await page.evaluate(() => {
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const visibleText = (document.body?.innerText || "").slice(0, 1500);
    const hasPasswordInput = Array.from(document.querySelectorAll("input[type='password'], input[placeholder*='密码']")).some(visible);
    const hasLoginForm = Array.from(document.querySelectorAll("form, .login, .login-form, .login-wrap, [class*='login']")).some((el) => visible(el) && /登录|密码|验证码/.test((el as HTMLElement).innerText || ""));
    const hasDownloadLink = Array.from(document.querySelectorAll("a,button")).some((el) => visible(el) && /下载全文|PDF|下载/.test((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("title") || ""));
    return {
      url: location.href,
      title: document.title,
      visibleText,
      hasPasswordInput,
      hasLoginForm,
      hasDownloadLink
    };
  }).catch(() => ({ url: page.url?.() || "", title: "", visibleText: "", hasPasswordInput: false, hasLoginForm: false, hasDownloadLink: false }));
}

async function ensureWanfangProfileAuthenticated(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<void> {
  const docId = requireWanfangDocId(args?.doc_id);
  const profile = String(args?.profile || wanfangPaywalledLiteratureConfig.default_profile).trim();
  if (!profile) throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "profile is required for Wanfang downloads");
  const articleUrl = resolveWanfangArticleUrlOrNull(docId) || (String(args?.pdf_url || "").match(/^https?:\/\//i) ? String(args?.pdf_url) : null);
  if (!articleUrl) return;
  const launcher = createManagedBrowserLauncher();
  if (!args?.cdp_port && !hasRegisteredOrExistingProfileState(launcher, profile)) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.LOGIN_REQUIRED,
      `Wanfang profile "${profile}" is not authenticated. ${WANFANG_MANUAL_LOGIN_MESSAGE}`,
      { profile, article_url: articleUrl, profile_state: "missing" }
    );
  }
  let browser: any;
  try {
    const status = await launcher.launch({ profile, cdpPort: args?.cdp_port });
    browser = await launcher.connectOverCdp(status);
  } catch (error) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.LOGIN_REQUIRED,
      `Wanfang profile "${profile}" is not authenticated. ${WANFANG_MANUAL_LOGIN_MESSAGE}`,
      { profile, article_url: articleUrl, cause: error instanceof Error ? error.message : String(error) }
    );
  }
  try {
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    try {
      await page.goto(articleUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((error: unknown) => {
        throw new LiteratureDownloadError(
          ConsumerErrorCodes.COMMAND_TIMEOUT,
          `Wanfang article-page auth preflight navigation failed: ${error instanceof Error ? error.message : String(error)}`,
          { article_url: articleUrl }
        );
      });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      const state = await inspectWanfangAuthState(page);
      if (looksLikeWanfangLoginRequired(state)) {
        throw new LiteratureDownloadError(
          ConsumerErrorCodes.LOGIN_REQUIRED,
          `Wanfang profile "${profile}" is not authenticated. ${WANFANG_MANUAL_LOGIN_MESSAGE}`,
          { profile, article_url: articleUrl, ...state }
        );
      }
    } finally {
      await page.close?.().catch(() => undefined);
    }
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

function wanfangQueuedOutputIfQuotaReached(args: Partial<PaywalledLiteratureDownloadPdfArgs>): LiteratureDownloadPdfOutput | null {
  const docId = String(args?.doc_id || "").trim();
  if (!docId) return null;
  const nowMs = Date.now();
  const quota = assertLiteratureQuota(wanfangPaywalledLiteratureConfig.db_slug, nowMs);
  if (quota.allowed) return null;
  const requestedUrl = /^https?:\/\//i.test(String(args?.pdf_url || "")) ? String(args?.pdf_url)
    : /^https?:\/\//i.test(docId) ? docId
    : null;
  const queued = enqueueLiteratureDownload(wanfangPaywalledLiteratureConfig.db_slug, docId, requestedUrl, nowMs);
  return {
    ok: true,
    task_id: queued.task_id,
    path: null,
    sha256: null,
    size: null,
    downloaded_at: null,
    errorCode: ConsumerErrorCodes.LITERATURE_QUEUED,
    message: `${wanfangPaywalledLiteratureConfig.db_slug} literature download quota reached; queued for worker retry after ${quota.retryAfterMs || 1}ms`
  };
}

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
    const id = String(docId || "").trim();
    return id ? resolveWanfangArticleUrlOrNull(id) : null;
  },
  candidate_url_filter: (url: string, docId: string) => {
    const id = wanfangArticleId(docId);
    const lower = String(url || "").toLowerCase();
    if (/\/www\/file\/wfdatazs\.pdf\b/i.test(lower)) return false;
    return !id || lower.includes(id) || lower.includes("/periodical/") || lower.includes("download");
  }
};

export async function webAiWanfangDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  const prepared = withResolvedWanfangArticleUrl(args);
  const queued = wanfangQueuedOutputIfQuotaReached(prepared);
  if (queued) return queued;
  try {
    await ensureWanfangProfileAuthenticated(prepared);
  } catch (error) {
    return literatureErrorOutput(error);
  }
  return runPaywalledLiteratureDownloadPdfTool(wanfangPaywalledLiteratureConfig, prepared);
}

registerLiteratureDriver(wanfangPaywalledLiteratureConfig.db_slug, async ({ doc_id, requested_url }) => {
  const docId = requireWanfangDocId(doc_id);
  const outputDir = defaultLiteratureOutputDir(wanfangPaywalledLiteratureConfig.db_slug);
  const requestedUrl = requested_url || resolveWanfangArticleUrl(docId);
  await ensureWanfangProfileAuthenticated({ doc_id: docId, pdf_url: requestedUrl, profile: wanfangPaywalledLiteratureConfig.default_profile });
  const result = await downloadPaywalledLiteraturePdfToDisk(
    wanfangPaywalledLiteratureConfig,
    docId,
    requestedUrl,
    outputDir,
    wanfangPaywalledLiteratureConfig.default_profile
  );
  return { path: result.path, sha256: result.sha256, resolved_url: result.resolved_url };
});
