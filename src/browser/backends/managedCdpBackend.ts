import { getStoragePaths } from "../../utils/paths";
import { createManagedBrowserLauncher } from "../../runtime/pool/profilePool";
import { ManagedBrowserLauncher, ManagedBrowserStatus } from "../managedLauncher";
import { PageRegistry } from "../pageRegistry";
import { TabEntry, TabRegistry } from "../tabRegistry";
import { activeManagedPage, firstBrowserContext, getCdpPageId, requireCdpPageId } from "../managedPageRouting";
import {
  BrowserAssetInfo,
  BrowserAssetsBundle,
  BrowserBackend,
  BrowserBackendPingResult,
  BrowserBox,
  BrowserClickOptions,
  BrowserElementState,
  BrowserElementSummary,
  BrowserElementTarget,
  BrowserFillOptions,
  BrowserNavigateOptions,
  BrowserNewTabOptions,
  BrowserPagePort,
  BrowserPressOptions,
  BrowserTabInfo,
  BrowserWaitForSelectorOptions,
  BrowserClaimTabOptions
} from "./types";

export interface ManagedCdpBackendOptions {
  profile?: string;
  dataDir?: string;
  launcher?: ManagedBrowserLauncher;
  pageRegistry?: PageRegistry;
}

const DEFAULT_PROFILE = process.env.WAH_DEFAULT_PROFILE || "default";

function targetSelector(target: BrowserElementTarget): string {
  if (target.selector) return target.selector;
  throw new Error("Managed CDP backend requires a CSS selector for this operation");
}

function mapStatusPage(kind: "managed-cdp", profile: string, page: any): BrowserTabInfo {
  const pageId = page.id ? String(page.id) : undefined;
  return {
    id: pageId || page.url || "managed-page",
    kind,
    pageId,
    profile,
    url: page.url || "about:blank",
    title: page.title,
    active: false,
    raw: page
  };
}

export class ManagedCdpPagePort implements BrowserPagePort {
  readonly kind = "managed-cdp" as const;

  constructor(
    private readonly page: any,
    private readonly browser: any,
    private readonly pageRegistry: PageRegistry,
    private readonly tabRegistry: TabRegistry,
    readonly tabId?: string,
    private readonly profile = DEFAULT_PROFILE
  ) {}

  async getInfo(): Promise<BrowserTabInfo> {
    const pageId = await getCdpPageId(this.page);
    const entry = this.pageRegistry.register(this.page);
    await this.pageRegistry.refresh();
    return {
      id: this.tabId || pageId || entry.id,
      kind: this.kind,
      tabId: this.tabId,
      pageId,
      profile: this.profile,
      url: this.page.url?.() || entry.url || "about:blank",
      title: typeof this.page.title === "function" ? await this.page.title().catch(() => entry.title) : entry.title,
      active: true
    };
  }

  async navigate(url: string, options: BrowserNavigateOptions = {}): Promise<BrowserTabInfo> {
    await this.page.goto(url, { waitUntil: options.waitUntil || "domcontentloaded", timeout: options.timeoutMs });
    await this.page.waitForLoadState?.(options.waitUntil || "domcontentloaded", { timeout: options.timeoutMs || 15000 }).catch(() => undefined);
    await this.persistTabEntry();
    return this.getInfo();
  }

  async waitForSelector(selector: string, options: BrowserWaitForSelectorOptions = {}): Promise<void> {
    await this.page.waitForSelector(selector, { state: options.state || "visible", timeout: options.timeoutMs });
  }

  async queryElements(selector: string, options: { limit?: number } = {}): Promise<BrowserElementSummary[]> {
    return this.page.$$eval(selector, (nodes: Element[], limit?: number) => nodes.slice(0, limit || 100).map((node, index) => {
      const element = node as HTMLElement;
      const attributes: Record<string, string> = {};
      for (const attr of Array.from(element.attributes || [])) attributes[attr.name] = attr.value;
      return {
        index,
        tagName: element.tagName.toLowerCase(),
        text: String(element.innerText || element.textContent || "").trim(),
        selector: attributes.id ? `#${attributes.id}` : undefined,
        attributes
      };
    }), options.limit);
  }

  async elementState(target: BrowserElementTarget): Promise<BrowserElementState> {
    const selector = targetSelector(target);
    return this.page.$eval(selector, (node: Element) => {
      const element = node as HTMLInputElement & HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        exists: true,
        visible: !!(rect.width || rect.height) && style.visibility !== "hidden" && style.display !== "none",
        disabled: Boolean((element as any).disabled),
        checked: typeof (element as any).checked === "boolean" ? Boolean((element as any).checked) : undefined,
        value: "value" in element ? (element as any).value : undefined,
        text: String(element.innerText || element.textContent || "").trim()
      };
    }).catch(() => ({ exists: false, visible: false }));
  }

  async elementBox(target: BrowserElementTarget): Promise<BrowserBox | null> {
    const selector = targetSelector(target);
    const handle = await this.page.$(selector);
    if (!handle) return null;
    const box = await handle.boundingBox?.();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  }

  async click(target: BrowserElementTarget, options: BrowserClickOptions = {}): Promise<void> {
    if (target.coordinates) {
      await this.page.mouse.click(target.coordinates.x, target.coordinates.y, { button: options.button || "left", clickCount: options.double ? 2 : 1 });
      return;
    }
    await this.page.click(targetSelector(target), { button: options.button || "left", timeout: options.timeoutMs });
  }

  async fill(target: BrowserElementTarget, value: string | number | boolean, options: BrowserFillOptions = {}): Promise<void> {
    await this.page.fill(targetSelector(target), String(value), { timeout: options.timeoutMs });
  }

  async press(key: string, options: BrowserPressOptions = {}): Promise<void> {
    if (options.selector) await this.page.press(options.selector, key, { delay: options.delayMs });
    else await this.page.keyboard.press(key, { delay: options.delayMs });
  }

  async evaluateReadOnly<T = unknown>(expression: string, arg?: unknown): Promise<T> {
    return this.page.evaluate(({ source, value }: { source: string; value: unknown }) => {
      const fn = new Function("arg", `return (${source});`);
      return fn(value);
    }, { source: expression, value: arg }) as Promise<T>;
  }

  async textSnapshot(options: { selector?: string } = {}): Promise<{ url: string; title?: string; text: string }> {
    const text = options.selector
      ? await this.page.$eval(options.selector, (node: Element) => String((node as HTMLElement).innerText || node.textContent || ""))
      : await this.page.evaluate(() => String(document.body?.innerText || document.body?.textContent || ""));
    return { url: this.page.url?.() || "about:blank", title: await this.page.title?.().catch(() => undefined), text };
  }

  async assetsList(): Promise<BrowserAssetInfo[]> {
    return this.page.evaluate(() => {
      const assets = new Map<string, BrowserAssetInfo>();
      const put = (url: string | null | undefined, type: BrowserAssetInfo["type"], initiatorType?: string) => {
        if (!url) return;
        try { assets.set(new URL(url, document.baseURI).href, { url: new URL(url, document.baseURI).href, type, initiatorType }); } catch { /* ignore invalid asset urls */ }
      };
      document.querySelectorAll("script[src]").forEach((node) => put((node as HTMLScriptElement).src, "script"));
      document.querySelectorAll('link[rel~="stylesheet"][href]').forEach((node) => put((node as HTMLLinkElement).href, "stylesheet"));
      document.querySelectorAll("img[src]").forEach((node) => put((node as HTMLImageElement).src, "image"));
      performance.getEntriesByType("resource").forEach((entry) => put((entry as PerformanceResourceTiming).name, "other", (entry as PerformanceResourceTiming).initiatorType));
      return Array.from(assets.values());
    });
  }

  async assetsBundle(): Promise<BrowserAssetsBundle> {
    return { assets: await this.assetsList(), capturedAt: new Date().toISOString() };
  }

  async close(): Promise<void> {
    if (this.tabId) await this.tabRegistry.unregister(this.tabId).catch(() => undefined);
    this.pageRegistry.unregister(this.page);
    await this.page.close?.().catch(() => undefined);
    await this.browser.close?.().catch(() => undefined);
  }

  private async persistTabEntry(): Promise<void> {
    if (!this.tabId) return;
    const pageId = await requireCdpPageId(this.page);
    const entry: TabEntry = {
      tabId: this.tabId,
      pageId,
      url: this.page.url?.() || "about:blank",
      profile: this.profile,
      allocatedAt: new Date().toISOString(),
      status: "active"
    };
    await this.tabRegistry.register(entry);
  }
}

export class ManagedCdpBackend implements BrowserBackend {
  readonly kind = "managed-cdp" as const;
  private readonly profile: string;
  private readonly dataDir: string;
  private readonly launcher: ManagedBrowserLauncher;
  private readonly pageRegistry: PageRegistry;
  private readonly tabRegistry: TabRegistry;

  constructor(options: ManagedCdpBackendOptions = {}) {
    this.profile = options.profile || DEFAULT_PROFILE;
    this.dataDir = options.dataDir || getStoragePaths().dataDir;
    this.launcher = options.launcher || createManagedBrowserLauncher();
    this.pageRegistry = options.pageRegistry || new PageRegistry();
    this.tabRegistry = new TabRegistry(this.dataDir);
  }

  async ping(): Promise<BrowserBackendPingResult> {
    const status = await this.launcher.status(this.profile);
    return { ok: status.connected, kind: this.kind, connected: status.connected, message: status.lastError };
  }

  async listTabs(options: { profile?: string } = {}): Promise<BrowserTabInfo[]> {
    const profile = options.profile || this.profile;
    const status = await this.launcher.status(profile);
    const statusTabs = (status.pages || []).map((page) => mapStatusPage(this.kind, profile, page));
    const leased = await this.tabRegistry.list().catch(() => [] as TabEntry[]);
    return statusTabs.map((tab) => {
      const lease = leased.find((entry) => entry.pageId === tab.pageId);
      return lease ? { ...tab, tabId: lease.tabId, active: lease.status === "active" } : tab;
    });
  }

  async claimTab(options: BrowserClaimTabOptions = {}): Promise<BrowserPagePort> {
    const profile = options.profile || this.profile;
    const { status, browser } = await this.launchAndConnect(profile, options.url);
    const page = await activeManagedPage(browser, options.url, options.tabId === undefined ? undefined : String(options.tabId), this.dataDir);
    this.pageRegistry.register(page);
    return new ManagedCdpPagePort(page, browser, this.pageRegistry, this.tabRegistry, options.tabId === undefined ? undefined : String(options.tabId), status.profile);
  }

  async newTab(options: BrowserNewTabOptions = {}): Promise<BrowserPagePort> {
    const profile = options.profile || this.profile;
    const { status, browser } = await this.launchAndConnect(profile);
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    if (options.url) {
      await page.goto(options.url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    }
    this.pageRegistry.register(page);
    if (options.tabId) {
      await this.tabRegistry.register({
        tabId: options.tabId,
        pageId: await requireCdpPageId(page),
        url: page.url?.() || options.url || "about:blank",
        profile: status.profile,
        allocatedAt: new Date().toISOString(),
        status: "active"
      });
    }
    return new ManagedCdpPagePort(page, browser, this.pageRegistry, this.tabRegistry, options.tabId, status.profile);
  }

  async finalize(): Promise<void> {
    await this.launcher.close(this.profile, "disconnect").catch(() => undefined);
  }

  private async launchAndConnect(profile: string, url?: string): Promise<{ status: ManagedBrowserStatus; browser: any }> {
    const status = await this.launcher.launch({ profile, ...(url ? { url } : {}) });
    const browser = await this.launcher.connectOverCdp(status);
    return { status, browser };
  }
}

export function createManagedCdpBackend(options: ManagedCdpBackendOptions = {}): ManagedCdpBackend {
  return new ManagedCdpBackend(options);
}
