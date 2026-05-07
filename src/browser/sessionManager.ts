import { PageRegistry, RegisteredPage } from "./pageRegistry";
import { DownloadManager } from "./downloads";
import { CapabilityDatabase } from "../capabilities/database";
import { DownloadRecord } from "../shared/types";
import { getStoragePaths } from "../utils/paths";
import { optionalRequire } from "../utils/optionalRequire";
import { logger } from "../utils/logger";

export interface BrowserSessionOptions {
  headed?: boolean;
  headless?: boolean;
  profileDir?: string;
  downloadDir?: string;
  cdpEndpoint?: string;
  slowMoMs?: number;
  targetId?: string;
}

export class BrowserSessionManager {
  private browser: any;
  private context: any;
  private started = false;
  private connectedOverCdp = false;
  readonly pageRegistry = new PageRegistry();
  readonly downloads: DownloadManager;
  readonly options: BrowserSessionOptions;
  private database?: CapabilityDatabase;
  private targetId?: string;

  constructor(options: BrowserSessionOptions = {}) {
    const storage = getStoragePaths();
    this.options = {
      headed: options.headed ?? true,
      headless: options.headless ?? (process.env.WAH_BROWSER_HEADLESS === "true"),
      profileDir: options.profileDir || storage.profileDir,
      downloadDir: options.downloadDir || storage.downloadDir,
      cdpEndpoint: options.cdpEndpoint || process.env.WAH_CDP_ENDPOINT,
      slowMoMs: options.slowMoMs
    };
    this.targetId = options.targetId;
    this.downloads = new DownloadManager(this.options.downloadDir!);
  }

  setDatabase(db: CapabilityDatabase): void {
    this.database = db;
  }

  setTarget(targetId: string): void {
    this.targetId = targetId;
  }

  isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const playwright = optionalRequire<any>("playwright");
    if (!playwright?.chromium) {
      throw new Error("Playwright is not installed. Run `npm install` and `npx playwright install chromium` before starting a real browser session.");
    }

    if (this.options.cdpEndpoint && process.env.WAH_CONNECT_CDP === "true") {
      logger.info({ endpoint: this.options.cdpEndpoint }, "Connecting to user-launched browser over CDP");
      this.browser = await playwright.chromium.connectOverCDP(this.options.cdpEndpoint);
      const contexts = this.browser.contexts();
      this.context = contexts[0] || await this.browser.newContext({ acceptDownloads: true });
      this.connectedOverCdp = true;
    } else {
      logger.info({ profileDir: this.options.profileDir, downloadDir: this.options.downloadDir }, "Launching persistent visible Chromium profile");
      this.context = await playwright.chromium.launchPersistentContext(this.options.profileDir, {
        headless: this.options.headless === true ? true : false,
        acceptDownloads: true,
        downloadsPath: this.options.downloadDir,
        slowMo: this.options.slowMoMs,
        viewport: null
      });
      this.browser = this.context.browser?.();
      this.connectedOverCdp = false;
    }

    this.registerExistingPages();
    this.context.on?.("page", (page: any) => this.attachPage(page));
    this.started = true;
  }

  private registerExistingPages(): void {
    for (const page of this.context?.pages?.() || []) this.attachPage(page);
  }

  private attachPage(page: any): void {
    const entry = this.pageRegistry.register(page);
    page.on?.("close", () => this.pageRegistry.unregister(page));
    page.on?.("download", async (download: any) => {
      try {
        const record = await this.downloads.saveDownload(download);
        this.insertDownloadArtifact(record);
      } catch (error) {
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Download could not be saved automatically");
      }
    });
    logger.debug({ pageId: entry.id }, "Registered page");
  }

  private insertDownloadArtifact(record: DownloadRecord): void {
    if (!this.database || !this.targetId) return;
    try {
      this.database.insertArtifact({
        target_id: this.targetId,
        capture_id: null,
        kind: "download",
        path: record.savedPath,
        metadata: {
          suggestedFilename: record.suggestedFilename,
          url: record.url ?? null,
          failure: record.failure ?? null
        }
      });
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error), path: record.savedPath, targetId: this.targetId }, "Download artifact row could not be recorded");
    }
  }

  async ensureStarted(): Promise<void> {
    if (!this.started) await this.start();
  }

  async newPage(): Promise<any> {
    await this.ensureStarted();
    const page = await this.context.newPage();
    this.attachPage(page);
    this.pageRegistry.setActive(this.pageRegistry.findByPage(page)!.id);
    return page;
  }

  async open(url: string): Promise<any> {
    await this.ensureStarted();
    const page = this.pageRegistry.getActive() || await this.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const entry = this.pageRegistry.findByPage(page);
    if (entry) this.pageRegistry.setActive(entry.id);
    return page;
  }

  async pages(): Promise<RegisteredPage[]> {
    await this.ensureStarted();
    return this.pageRegistry.refresh();
  }

  activePage(): any {
    return this.pageRegistry.getActive();
  }

  async setActivePage(id: string): Promise<void> {
    this.pageRegistry.setActive(id);
  }

  async close(): Promise<void> {
    if (!this.started) return;
    if (this.connectedOverCdp || (this.options.cdpEndpoint && this.browser?.disconnect)) {
      await this.browser?.close?.();
    } else {
      await this.context?.close?.();
      await this.browser?.close?.();
    }
    this.started = false;
    this.connectedOverCdp = false;
  }
}
