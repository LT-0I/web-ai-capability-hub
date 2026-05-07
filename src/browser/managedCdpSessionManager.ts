import { ManagedBrowserLauncher, ManagedBrowserLaunchOptions, ManagedBrowserStatus } from "./managedLauncher";

export class ManagedCdpSessionManager {
  constructor(private launcher = new ManagedBrowserLauncher()) {}

  async launch(options: ManagedBrowserLaunchOptions = {}): Promise<ManagedBrowserStatus> {
    return this.launcher.launch(options);
  }

  async status(profile?: string): Promise<ManagedBrowserStatus> {
    return this.launcher.status(profile);
  }

  async pages(profile?: string) {
    return this.launcher.pages(profile);
  }

  async connect(status?: ManagedBrowserStatus) {
    return this.launcher.connectOverCdp(status);
  }

  async close(profile?: string, mode: "disconnect" | "close-process" | "leave-open" = "disconnect") {
    return this.launcher.close(profile, mode);
  }
}
