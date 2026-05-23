import { getStoragePaths } from "../utils/paths";
import { ManagedBrowserLauncher } from "./managedLauncher";
import { createManagedBrowserLauncher } from "../runtime/pool/profilePool";
import { firstBrowserContext, findPageByCdpPageId, requireCdpPageId } from "./managedPageRouting";
import { TabEntry, TabRegistry } from "./tabRegistry";

export interface SessionHandle {
  tabId: string;
  pageId: string;
  url: string;
  cdpEndpoint: string;
}

export async function allocateSession(
  profile: string,
  url: string,
  tabId: string,
  dataDir = getStoragePaths().dataDir
): Promise<SessionHandle> {
  const registry = new TabRegistry(dataDir);
  const existing = await registry.get(tabId);
  if (existing?.status === "active") throw new Error(`Tab ID "${tabId}" is already allocated`);

  const launcher = createManagedBrowserLauncher();
  const status = await launcher.launch({ profile });
  const browser = await launcher.connectOverCdp(status);
  try {
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
    const pageId = await requireCdpPageId(page);
    const entry: TabEntry = {
      tabId,
      pageId,
      url: page.url?.() || url,
      profile,
      allocatedAt: new Date().toISOString(),
      status: "active"
    };
    await registry.register(entry);
    return { tabId, pageId, url: entry.url, cdpEndpoint: status.cdpEndpoint };
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}

export async function freeSession(tabId: string, dataDir = getStoragePaths().dataDir): Promise<void> {
  const registry = new TabRegistry(dataDir);
  const entry = await registry.get(tabId);
  if (!entry) return;

  const launcher = createManagedBrowserLauncher();
  const status = await launcher.status(entry.profile);
  if (status.connected) {
    const browser = await launcher.connectOverCdp(status);
    try {
      const page = await findPageByCdpPageId(browser, entry.pageId);
      await page?.close?.().catch(() => undefined);
    } finally {
      await browser.close?.().catch(() => undefined);
    }
  }
  await registry.unregister(tabId);
}

export async function listSessions(profile?: string, dataDir = getStoragePaths().dataDir): Promise<TabEntry[]> {
  const entries = await new TabRegistry(dataDir).list();
  return profile ? entries.filter((entry) => entry.profile === profile) : entries;
}
