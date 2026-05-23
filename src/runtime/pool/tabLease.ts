import { activeManagedPage } from "../../browser/managedPageRouting";
import { createManagedBrowserLauncher } from "./profilePool";
import { RuntimeLeaseStore, runtimeLeaseStore } from "./leaseStore";

export interface AcquireTabOptions {
  profileId: string;
  profileLeaseId: string;
  cdpEndpoint: string;
  urlMatch: string;
  ttlSeconds?: number;
}

export interface AcquiredTabLease {
  leaseId: string;
  page: any;
  releaseFn: () => Promise<void>;
}

export async function acquireTab(options: AcquireTabOptions, store: RuntimeLeaseStore = runtimeLeaseStore()): Promise<AcquiredTabLease> {
  if (!options.urlMatch || !options.urlMatch.trim()) {
    const error: any = new Error("INVALID_ARGS: acquireTab requires urlMatch; callers must not silently pick pages()[0]");
    error.errorCode = "INVALID_ARGS";
    throw error;
  }
  const tabLease = store.acquireTabLease(options.profileLeaseId, options.urlMatch, options.ttlSeconds || 300);
  const launcher = createManagedBrowserLauncher();
  const browser = await launcher.connectOverCdp({ profile: options.profileId, profileDir: "", cdpEndpoint: options.cdpEndpoint, cdpPort: Number(new URL(options.cdpEndpoint).port || 0), connected: true, launchedByPackage: false } as any);
  try {
    const page = await activeManagedPage(browser, undefined, options.urlMatch);
    return {
      leaseId: tabLease.lease_id,
      page,
      releaseFn: async () => {
        store.releaseTabLease(tabLease.lease_id);
        await browser.close?.().catch(() => undefined);
      }
    };
  } catch (error) {
    store.releaseTabLease(tabLease.lease_id, "expired");
    await browser.close?.().catch(() => undefined);
    throw error;
  }
}
