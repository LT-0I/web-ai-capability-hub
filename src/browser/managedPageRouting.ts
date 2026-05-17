import { getStoragePaths } from "../utils/paths";
import { TabRegistry } from "./tabRegistry";

export function isUsefulPageUrl(url: string): boolean {
  return !!url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("devtools://");
}

export function pageMatchesTargetUrl(pageUrl: string, targetUrl?: string): boolean {
  if (!targetUrl || !pageUrl) return false;
  try {
    const page = new URL(pageUrl);
    const target = new URL(targetUrl);
    const sameHost = page.hostname === target.hostname || page.hostname.endsWith(`.${target.hostname}`);
    if (!sameHost) return false;
    const normalizePath = (value: string) => (value || "/").replace(/\/$/, "") || "/";
    const pagePath = normalizePath(page.pathname);
    const targetPath = normalizePath(target.pathname);
    if (/^\/(auth|login|signin|signup|logout)(?:\/|$)/i.test(pagePath)) return true;
    if (targetPath === "/") return true;
    if (targetPath === "/app") return pagePath === "/app" || pagePath.startsWith("/app/");
    return pagePath === targetPath;
  } catch {
    return pageUrl === targetUrl;
  }
}

function directPageId(page: any): string | undefined {
  const targetId = page?.target?.()?.targetId?.();
  if (targetId) return String(targetId);
  const channelGuid = page?._channel?._guid;
  if (channelGuid) return String(channelGuid);
  const guid = page?._guid;
  if (guid) return String(guid);
  const frameId = page?.mainFrame?.()?._id;
  return frameId ? String(frameId) : undefined;
}

export async function getCdpPageId(page: any): Promise<string | undefined> {
  const context = page?.context?.();
  const newSession = context?.newCDPSession;
  if (typeof newSession === "function") {
    let session: any;
    try {
      session = await newSession.call(context, page);
      const result = await session.send("Target.getTargetInfo");
      const targetId = result?.targetInfo?.targetId;
      if (targetId) return String(targetId);
    } catch {
      // Fall through to private Playwright fields below when CDP session lookup fails.
    } finally {
      await session?.detach?.().catch(() => undefined);
    }
  }
  return directPageId(page);
}

export async function requireCdpPageId(page: any): Promise<string> {
  const pageId = await getCdpPageId(page);
  if (!pageId) throw new Error("Could not determine CDP target id for the browser page");
  return pageId;
}

export function allBrowserPages(browser: any): any[] {
  const contexts = browser.contexts?.() || [];
  return contexts.flatMap((ctx: any) => ctx.pages?.() || []);
}

export async function firstBrowserContext(browser: any): Promise<any> {
  const contexts = browser.contexts?.() || [];
  const context = contexts[0] || await browser.newContext?.();
  if (!context) throw new Error("No browser context is available from the managed CDP connection.");
  return context;
}

export async function findPageByCdpPageId(browser: any, pageId: string): Promise<any | undefined> {
  for (const page of allBrowserPages(browser)) {
    if ((await getCdpPageId(page)) === pageId) return page;
  }
  return undefined;
}

export interface InstitutionalSessionSettleOptions {
  budgetMs?: number;
  intervalMs?: number;
}

const DEFAULT_SESSION_SETTLE_MS = 90000;
const MAX_SESSION_SETTLE_MS = 120000;
const DEFAULT_SESSION_SETTLE_INTERVAL_MS = 2000;
const MIN_SESSION_SETTLE_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function sessionSettleBudgetMs(opts?: InstitutionalSessionSettleOptions): number {
  const raw = opts?.budgetMs ?? process.env.WAH_SESSION_SETTLE_MS;
  return boundedNumber(raw, DEFAULT_SESSION_SETTLE_MS, 0, MAX_SESSION_SETTLE_MS);
}

function sessionSettleIntervalMs(opts?: InstitutionalSessionSettleOptions): number {
  return boundedNumber(
    opts?.intervalMs,
    DEFAULT_SESSION_SETTLE_INTERVAL_MS,
    MIN_SESSION_SETTLE_INTERVAL_MS,
    Math.max(MIN_SESSION_SETTLE_INTERVAL_MS, DEFAULT_SESSION_SETTLE_MS)
  );
}

function isInstitutionalIntermediateUrl(url: string): boolean {
  if (!url) return true;
  if (url === "about:blank") return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathAndQuery = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    const hostTokens = ["sso", "idp", "wayf", "ezproxy", "openathens", "shibboleth"];
    const pathTokens = [
      "/login",
      "/signin",
      "/sign-in",
      "/sso",
      "/idp",
      "/wayf",
      "/saml",
      "/cas",
      "/oauth",
      "/authorize",
      "ezproxy",
      "openathens",
      "shibboleth",
      "institutional-login",
      "institutionlogin"
    ];
    return hostTokens.some((token) => host.includes(token))
      || pathTokens.some((token) => pathAndQuery.includes(token));
  } catch {
    return false;
  }
}

function isLikelySearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    return /\b(?:search|dosearch|advanced|query|results?|find)\b/.test(haystack)
      || ["q", "query", "text1", "search", "searchterm", "searchTerm"].some((key) => parsed.searchParams.has(key));
  } catch {
    return false;
  }
}

function textHasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

async function pageLooksSessionEstablished(page: any): Promise<boolean> {
  const url = (() => {
    try { return String(page?.url?.() || ""); } catch { return ""; }
  })();
  if (!url || url === "about:blank") return true;
  if (isInstitutionalIntermediateUrl(url)) return false;

  try {
    const snapshot = await page?.evaluate?.(() => {
      const body = document.body;
      const text = String(body?.innerText || body?.textContent || "").replace(/\s+/g, " ").trim();
      const rootSelectors = ["main", "[role='main']", "#app", "#root", "#__next", "[data-reactroot]", "app-root"];
      const hasAppRoot = rootSelectors.some((selector) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        const elementText = String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
        return !!element && (elementText.length >= 80 || (element.children?.length || 0) >= 3);
      });
      const elements = Array.from(document.querySelectorAll("[id], [class], [data-testid], [role]"));
      const resultLikeNodeCount = elements.filter((element) => {
        const haystack = [
          element.id,
          element.className,
          element.getAttribute("data-testid"),
          element.getAttribute("role")
        ].join(" ").toLowerCase();
        return /\b(results?|search-results?|items?|records?)\b/.test(haystack);
      }).length;
      const progressNodeCount = elements.filter((element) => {
        const haystack = [
          element.id,
          element.className,
          element.getAttribute("aria-busy"),
          element.getAttribute("role")
        ].join(" ").toLowerCase();
        return /\b(spinner|loading|loader|progressbar|progress|busy|skeleton)\b/.test(haystack);
      }).length;
      return {
        readyState: document.readyState,
        textLength: text.length,
        textSample: text.slice(0, 4000),
        hasAppRoot,
        resultLikeNodeCount,
        progressNodeCount,
        linkCount: document.links?.length || 0,
        formCount: document.forms?.length || 0
      };
    });
    if (!snapshot) return false;

    const sample = String(snapshot.textSample || "").toLowerCase();
    const hasInterstitialText = textHasAny(sample, [
      /\bestablishing (?:your )?session\b/i,
      /\bchecking your browser\b/i,
      /\bjust a moment\b/i,
      /\byou are being redirected\b/i,
      /\bredirecting\b/i,
      /\bplease wait\b/i,
      /\bselect your institution\b/i,
      /\bwhere are you from\b/i,
      /\bsingle sign[- ]on\b/i,
      /\binstitutional login\b/i,
      /\baccess through your institution\b/i,
      /\bopenathens\b/i,
      /\bshibboleth\b/i,
      /\bezproxy\b/i,
      /\bverify you are human\b/i,
      /\bcaptcha\b/i
    ]);
    if (hasInterstitialText) return false;

    const hasResultText = textHasAny(sample, [
      /\bresults?\b/i,
      /\bresultados?\b/i,
      /\brésultats?\b/i,
      /\bergebnisse\b/i,
      /\brisultati\b/i,
      /\bitems?\b/i,
      /\brecords?\b/i,
      /结果|結果|検索結果|검색\s*결과/i
    ]);
    const hasMeaningfulBody = Number(snapshot.textLength || 0) >= 120;
    const searchUrl = isLikelySearchUrl(url);
    const hasSearchReadySignal = hasResultText || Number(snapshot.resultLikeNodeCount || 0) > 0;
    const hasStrongContent = hasSearchReadySignal
      || Number(snapshot.resultLikeNodeCount || 0) > 0
      || Boolean(snapshot.hasAppRoot)
      || (!searchUrl && hasMeaningfulBody && (Number(snapshot.linkCount || 0) > 0 || Number(snapshot.formCount || 0) > 0));
    const isMostlySpinnerShell = Number(snapshot.progressNodeCount || 0) > 0
      && Number(snapshot.textLength || 0) < 500
      && !hasResultText;

    return snapshot.readyState === "complete"
      && hasMeaningfulBody
      && (!searchUrl || hasSearchReadySignal)
      && hasStrongContent
      && !isMostlySpinnerShell;
  } catch {
    return false;
  }
}

export async function settleInstitutionalSession(page: any, opts: InstitutionalSessionSettleOptions = {}): Promise<any> {
  const budgetMs = sessionSettleBudgetMs(opts);
  if (budgetMs <= 0) return page;

  const intervalMs = sessionSettleIntervalMs(opts);
  const deadline = Date.now() + budgetMs;
  while (true) {
    try {
      if (await pageLooksSessionEstablished(page)) return page;
    } catch {
      // Keep polling until the bounded budget expires; existing flow checks own errors.
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return page;
    await sleep(Math.min(intervalMs, remainingMs));
  }
}

export async function activeManagedPage(
  browser: any,
  targetUrl?: string,
  tabId?: string,
  dataDir = getStoragePaths().dataDir
): Promise<any> {
  const context = await firstBrowserContext(browser);

  if (tabId) {
    const registry = new TabRegistry(dataDir);
    const entry = await registry.get(tabId);
    if (!entry) throw new Error(`Tab ID "${tabId}" not found in registry`);
    if (entry.status !== "active") throw new Error(`Tab ID "${tabId}" is not active`);

    const page = await findPageByCdpPageId(browser, entry.pageId);
    if (!page) throw new Error(`Tab ID "${tabId}" registered but page not found in browser`);
    if (targetUrl && !pageMatchesTargetUrl(page.url?.() || "", targetUrl)) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    }
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    await settleInstitutionalSession(page);
    await registry.register({ ...entry, url: page.url?.() || entry.url, status: "active" });
    return page;
  }

  const pages = allBrowserPages(browser);
  let page = pages.find((candidate: any) => pageMatchesTargetUrl(candidate.url?.() || "", targetUrl));
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || "") && candidate.url?.() !== "about:blank");
  if (!page) page = pages.find((candidate: any) => isUsefulPageUrl(candidate.url?.() || ""));
  if (!page) page = await context.newPage();
  if (targetUrl && !pageMatchesTargetUrl(page.url?.() || "", targetUrl)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }
  await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
  await settleInstitutionalSession(page);
  return page;
}
