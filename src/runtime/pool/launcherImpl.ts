import { ManagedBrowserLaunchOptions } from "../../browser/managedLauncher";

export interface LauncherImpl {
  launch(opts: {
    profile: string;
    cdpPort?: number;
    url?: string;
  } & Omit<ManagedBrowserLaunchOptions, "profile" | "cdpPort" | "url">): Promise<{
    cdpEndpoint: string;
    pid: number;
    close: () => Promise<void>;
  }>;
}
