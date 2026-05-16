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
  return page;
}
