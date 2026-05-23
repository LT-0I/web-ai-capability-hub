import { ManagedBrowserLauncher, ManagedBrowserLaunchOptions } from "../../browser/managedLauncher";
import { LauncherImpl } from "./launcherImpl";
import { RuntimeLeaseStore, runtimeLeaseStore, startLeaseGc } from "./leaseStore";

export interface ProfilePoolAcquireOptions extends Omit<ManagedBrowserLaunchOptions, "profile"> {
  ttlSeconds?: number;
  urlMatch?: string;
  databasePath?: string;
}

export interface AcquiredProfileLease {
  leaseId: string;
  profileId: string;
  runId: string;
  cdpEndpoint: string;
  releaseFn: () => Promise<void>;
  heartbeat: () => void;
}

export function createManagedBrowserLauncher(): ManagedBrowserLauncher {
  return new ManagedBrowserLauncher();
}

export class ManagedBrowserLauncherImpl implements LauncherImpl {
  async launch(opts: {
    profile: string;
    cdpPort?: number;
    url?: string;
  } & Omit<ManagedBrowserLaunchOptions, "profile" | "cdpPort" | "url">): Promise<{
    cdpEndpoint: string;
    pid: number;
    close: () => Promise<void>;
  }> {
    const launcher = createManagedBrowserLauncher();
    const status = await launcher.launch(opts);
    return {
      cdpEndpoint: status.cdpEndpoint,
      pid: status.processId || process.pid,
      close: async () => {
        await launcher.close(opts.profile, "disconnect").catch(() => undefined);
      }
    };
  }
}

export function createDefaultLauncherImpl(): LauncherImpl {
  return new ManagedBrowserLauncherImpl();
}

export class ProfilePool {
  constructor(private store: RuntimeLeaseStore = runtimeLeaseStore(), private launcher: LauncherImpl = createDefaultLauncherImpl()) {
    startLeaseGc(this.store);
  }

  async acquireProfile(profileId: string, runId: string, opts: ProfilePoolAcquireOptions = {}): Promise<AcquiredProfileLease> {
    if (!profileId || !profileId.trim()) {
      const error: any = new Error("INVALID_ARGS: profileId is required");
      error.errorCode = "INVALID_ARGS";
      throw error;
    }
    if (!runId || !runId.trim()) {
      const error: any = new Error("INVALID_ARGS: runId is required");
      error.errorCode = "INVALID_ARGS";
      throw error;
    }
    const existing = this.store.activeProfileLease(profileId);
    if (existing && existing.run_id !== runId) {
      const error: any = new Error(`PROFILE_LEASE_BUSY: profile ${profileId} is already leased by run ${existing.run_id}`);
      error.errorCode = "PROFILE_LEASE_BUSY";
      error.evidence = { existing };
      throw error;
    }
    const launched = await this.launcher.launch({ ...opts, profile: profileId, url: opts.url });
    const lease = this.store.acquireProfileLease(profileId, runId, launched.cdpEndpoint, opts.ttlSeconds || 300, launched.pid);
    return {
      leaseId: lease.lease_id,
      profileId,
      runId,
      cdpEndpoint: launched.cdpEndpoint,
      heartbeat: () => this.store.heartbeatProfileLease(lease.lease_id),
      releaseFn: async () => {
        this.store.releaseProfileLease(lease.lease_id);
        await launched.close().catch(() => undefined);
      }
    };
  }
}

export const profilePool = new ProfilePool();
export async function acquireProfile(profileId: string, runId: string, opts: ProfilePoolAcquireOptions = {}): Promise<AcquiredProfileLease> {
  return profilePool.acquireProfile(profileId, runId, opts);
}
