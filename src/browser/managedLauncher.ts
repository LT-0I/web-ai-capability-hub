const childProcess = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
import { BrowserExecutableCandidate, BrowserKind, findBrowserExecutable } from "./executableDiscovery";
import { BrowserProfileStore, BrowserProfileRecord } from "./profileStore";
import { optionalRequire } from "../utils/optionalRequire";

export interface ManagedBrowserLaunchOptions {
  profile?: string;
  url?: string;
  browserKind?: BrowserKind;
  executablePath?: string;
  cdpHost?: string;
  cdpPort?: number;
  extraArgs?: string[];
  reuseExisting?: boolean;
  extensionAssisted?: boolean;
  extensionPath?: string;
}

export interface ManagedBrowserStatus {
  profile: string;
  executablePath?: string;
  profileDir: string;
  cdpEndpoint: string;
  cdpPort: number;
  connected: boolean;
  launchedByPackage: boolean;
  processId?: number;
  pages?: CdpPageInfo[];
  browser?: string;
  webSocketDebuggerUrl?: string;
  lastError?: string;
}

export interface CdpPageInfo {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export type BrowserCloseMode = "disconnect" | "close-process" | "leave-open";

function jsonEndpoint(host: string, port: number, path = "/json/version"): string {
  return `http://${host}:${port}${path}`;
}

function httpGetJson<T = any>(url: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res: any) => {
      const chunks: any[] = [];
      res.on("data", (chunk: any) => chunks.push(chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
        catch (error) { reject(error); }
      });
    });
    req.on("timeout", () => { req.destroy(new Error(`Timeout while reading ${url}`)); });
    req.on("error", reject);
  });
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCdpEndpointReadinessError(error: unknown): boolean {
  return /CDP endpoint did not become ready|ECONNREFUSED|ECONNRESET|ECONNABORTED|socket hang up/i.test(errorMessage(error));
}

export async function pollForCdpReady(host: string, port: number, budgetMs = 5000, intervalMs = 100): Promise<any> {
  const endpoint = jsonEndpoint(host, port);
  const started = Date.now();
  const budget = Math.max(1, budgetMs);
  const deadline = started + budget;
  let lastError: unknown;
  do {
    try {
      return await httpGetJson(endpoint, Math.min(1500, Math.max(100, deadline - Date.now())));
    } catch (error) {
      lastError = error;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleepMs(Math.min(Math.max(1, intervalMs), remaining));
    }
  } while (Date.now() <= deadline);
  throw new Error(`CDP endpoint did not become ready within ${budget}ms (${endpoint}): ${errorMessage(lastError)}`);
}

export function buildLaunchArguments(options: Required<Pick<ManagedBrowserLaunchOptions, "cdpHost" | "cdpPort">> & { profileDir: string; url?: string; extraArgs?: string[]; extensionAssisted?: boolean; extensionPath?: string }): string[] {
  const args = [
    `--remote-debugging-address=${options.cdpHost}`,
    `--remote-debugging-port=${options.cdpPort}`,
    `--user-data-dir=${options.profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking"
  ];
  if (options.extensionAssisted) {
    if (!options.extensionPath) throw new Error("extensionPath is required when extensionAssisted=true");
    args.push(`--load-extension=${options.extensionPath}`);
    args.push(`--disable-extensions-except=${options.extensionPath}`);
  }
  if (options.extraArgs?.length) args.push(...options.extraArgs);
  if (options.url) args.push(options.url);
  return args;
}

export async function findFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function waitForCdpVersion(host: string, port: number, timeoutMs = 12000): Promise<any> {
  return pollForCdpReady(host, port, timeoutMs, 250);
}

export async function readCdpPages(host: string, port: number): Promise<CdpPageInfo[]> {
  try {
    const pages = await httpGetJson<CdpPageInfo[]>(jsonEndpoint(host, port, "/json/list"), 2000);
    return Array.isArray(pages) ? pages : [];
  } catch { return []; }
}

function endpointHostAndPort(endpoint: string, fallbackHost: string, fallbackPort: number): { host: string; port: number } {
  try {
    const url = new URL(endpoint);
    return { host: url.hostname || fallbackHost, port: Number(url.port || fallbackPort) };
  } catch {
    return { host: fallbackHost, port: fallbackPort };
  }
}

export function detachLaunchedProcess(child: any): void {
  child?.unref?.();
}

export function terminateProcessTree(pid: number): void {
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    childProcess.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try { process.kill(-pid, "SIGTERM"); return; } catch { /* fall back to direct pid */ }
  try { process.kill(pid, "SIGTERM"); } catch { /* already stopped or not owned by this process */ }
}

export class ManagedBrowserLauncher {
  readonly profileStore: BrowserProfileStore;
  private launchedProcess?: any;
  private playwrightBrowser?: any;
  private lastStatus?: ManagedBrowserStatus;

  constructor(profileStore = new BrowserProfileStore()) {
    this.profileStore = profileStore;
  }

  async launch(options: ManagedBrowserLaunchOptions = {}): Promise<ManagedBrowserStatus> {
    const profile = options.profile || process.env.WAH_DEFAULT_PROFILE || "default";
    const existingRecord = this.profileStore.get(profile);
    const cdpHost = options.cdpHost || process.env.WAH_CDP_HOST || "127.0.0.1";
    const existingEndpoint = existingRecord.cdpEndpoint;
    const existingPort = existingRecord.cdpPort;
    const explicitPort = options.cdpPort || process.env.WAH_CDP_PORT;
    const cdpPort = Number(explicitPort || existingPort || await findFreePort(cdpHost));
    const profileDir = existingRecord.profileDir || this.profileStore.resolveProfileDir(profile);
    const cdpEndpoint = `http://${cdpHost}:${cdpPort}`;

    if (options.reuseExisting !== false) {
      if (existingEndpoint && !explicitPort) {
        try {
          const { host, port } = endpointHostAndPort(existingEndpoint, cdpHost, cdpPort);
          const version = await httpGetJson<any>(`${existingEndpoint}/json/version`, 700);
          const pages = await readCdpPages(host, port);
          return this.recordStatus(profile, { profile, executablePath: existingRecord.executablePath, profileDir, cdpEndpoint: existingEndpoint, cdpPort: port, connected: true, launchedByPackage: !!existingRecord.launchedByPackage, processId: existingRecord.processId, pages, browser: version.Browser, webSocketDebuggerUrl: version.webSocketDebuggerUrl });
        } catch { /* existing profile metadata is stale; launch below */ }
      }
      try {
        const version = await httpGetJson<any>(`${cdpEndpoint}/json/version`, 700);
        const pages = await readCdpPages(cdpHost, cdpPort);
        return this.recordStatus(profile, { profile, executablePath: existingRecord.executablePath, profileDir, cdpEndpoint, cdpPort, connected: true, launchedByPackage: false, processId: existingRecord.processId, pages, browser: version.Browser, webSocketDebuggerUrl: version.webSocketDebuggerUrl });
      } catch { /* launch a managed browser below */ }
    }

    const discovered: BrowserExecutableCandidate | undefined = options.executablePath
      ? { kind: options.browserKind || "chrome", path: options.executablePath, source: "env" }
      : findBrowserExecutable(options.browserKind);
    if (!discovered) throw new Error("Chrome/Edge executable was not found. Set WAH_BROWSER_EXECUTABLE to a Chrome or Edge executable path.");
    const args = buildLaunchArguments({
      cdpHost,
      cdpPort,
      profileDir,
      url: options.url,
      extraArgs: options.extraArgs || [],
      extensionAssisted: options.extensionAssisted === true,
      extensionPath: options.extensionPath
    });
    this.launchedProcess = childProcess.spawn(discovered.path, args, { detached: true, stdio: "ignore", windowsHide: true });
    detachLaunchedProcess(this.launchedProcess);
    this.launchedProcess.once?.("error", (error: Error) => { this.lastStatus = { ...(this.lastStatus as any), connected: false, lastError: error.message }; });
    const version = await waitForCdpVersion(cdpHost, cdpPort);
    const pages = await readCdpPages(cdpHost, cdpPort);
    this.profileStore.upsert({ profileName: profile, browserType: discovered.kind, executablePath: discovered.path, profileDir, cdpEndpoint, cdpPort, processId: this.launchedProcess.pid, lastStatus: "launched", launchedByPackage: true });
    return this.recordStatus(profile, { profile, executablePath: discovered.path, profileDir, cdpEndpoint, cdpPort, connected: true, launchedByPackage: true, processId: this.launchedProcess.pid, pages, browser: version.Browser, webSocketDebuggerUrl: version.webSocketDebuggerUrl });
  }

  async status(profile = process.env.WAH_DEFAULT_PROFILE || "default"): Promise<ManagedBrowserStatus> {
    const record = this.profileStore.get(profile);
    const host = process.env.WAH_CDP_HOST || "127.0.0.1";
    const port = Number(record.cdpPort || process.env.WAH_CDP_PORT || 9222);
    const endpoint = record.cdpEndpoint || `http://${host}:${port}`;
    try {
      const url = new URL(endpoint);
      const version = await httpGetJson<any>(`${endpoint}/json/version`, 800);
      const pages = await readCdpPages(url.hostname, Number(url.port));
      return this.recordStatus(profile, { profile, executablePath: record.executablePath, profileDir: record.profileDir, cdpEndpoint: endpoint, cdpPort: Number(url.port), connected: true, launchedByPackage: !!record.launchedByPackage, processId: this.launchedProcess?.pid || record.processId, pages, browser: version.Browser, webSocketDebuggerUrl: version.webSocketDebuggerUrl });
    } catch (error) {
      return this.recordStatus(profile, { profile, executablePath: record.executablePath, profileDir: record.profileDir, cdpEndpoint: endpoint, cdpPort: port, connected: false, launchedByPackage: !!record.launchedByPackage, processId: this.launchedProcess?.pid || record.processId, pages: [], lastError: error instanceof Error ? error.message : String(error) });
    }
  }

  async pages(profile = process.env.WAH_DEFAULT_PROFILE || "default"): Promise<CdpPageInfo[]> {
    const status = await this.status(profile);
    return status.pages || [];
  }

  async connectOverCdp(status = this.lastStatus): Promise<any> {
    if (!status?.connected) throw new Error("No connected CDP endpoint. Launch or connect before requesting a Playwright CDP session.");
    const playwright = optionalRequire<any>("playwright");
    if (!playwright?.chromium?.connectOverCDP) throw new Error("Playwright is not installed. Run npm install before connecting over CDP.");
    if (process.env.PW_CHROMIUM_ATTACH_TO_OTHER === undefined) process.env.PW_CHROMIUM_ATTACH_TO_OTHER = "1";
    const { host, port } = endpointHostAndPort(status.cdpEndpoint, process.env.WAH_CDP_HOST || "127.0.0.1", status.cdpPort);
    const budgetMs = 5000;
    const deadline = Date.now() + budgetMs;
    let lastError: unknown;
    for (;;) {
      try {
        await pollForCdpReady(host, port, Math.max(1, deadline - Date.now()), 100);
        this.playwrightBrowser = await playwright.chromium.connectOverCDP(status.cdpEndpoint);
        return this.playwrightBrowser;
      } catch (error) {
        lastError = error;
        if (!isCdpEndpointReadinessError(error) || Date.now() >= deadline) break;
        await sleepMs(Math.min(100, Math.max(1, deadline - Date.now())));
      }
    }
    if (isCdpEndpointReadinessError(lastError)) {
      throw new Error(`CDP endpoint did not become ready within ${budgetMs}ms (${status.cdpEndpoint}): ${errorMessage(lastError)}`);
    }
    throw lastError;
  }

  async close(profile = process.env.WAH_DEFAULT_PROFILE || "default", mode: BrowserCloseMode = "disconnect"): Promise<ManagedBrowserStatus> {
    if (mode === "disconnect") {
      await this.playwrightBrowser?.close?.();
      this.playwrightBrowser = undefined;
      return this.status(profile);
    }
    if (mode === "close-process") {
      const record = this.profileStore.get(profile);
      const pid = this.launchedProcess?.pid || record.processId;
      await this.playwrightBrowser?.close?.().catch(() => undefined);
      if (pid) terminateProcessTree(pid);
      this.profileStore.updateStatus(profile, { lastStatus: "closed", processId: undefined });
      this.lastStatus = undefined;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return this.status(profile);
    }
    return this.status(profile);
  }

  private recordStatus(profile: string, status: ManagedBrowserStatus): ManagedBrowserStatus {
    this.lastStatus = status;
    this.profileStore.updateStatus(profile, { profileName: profile, executablePath: status.executablePath, profileDir: status.profileDir, cdpEndpoint: status.cdpEndpoint, cdpPort: status.cdpPort, processId: status.processId, lastStatus: status.connected ? "connected" : "disconnected", launchedByPackage: status.launchedByPackage });
    return status;
  }
}

export function profileRecordToBrowserStatus(record: BrowserProfileRecord): ManagedBrowserStatus {
  const endpoint = record.cdpEndpoint || `http://${process.env.WAH_CDP_HOST || "127.0.0.1"}:${record.cdpPort || process.env.WAH_CDP_PORT || 9222}`;
  return { profile: record.profileName, executablePath: record.executablePath, profileDir: record.profileDir, cdpEndpoint: endpoint, cdpPort: record.cdpPort || 9222, connected: record.lastStatus === "connected", launchedByPackage: !!record.launchedByPackage, processId: record.processId };
}
