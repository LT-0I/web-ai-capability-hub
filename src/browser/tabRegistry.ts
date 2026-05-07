const fs = require("node:fs");
const path = require("node:path");
import { ensureDir } from "../utils/paths";

export interface TabEntry {
  tabId: string;
  pageId: string;
  url: string;
  profile: string;
  allocatedAt: string;
  status: "active" | "free";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TabRegistry {
  private registryPath: string;
  private lockPath: string;

  constructor(dataDir: string) {
    ensureDir(dataDir);
    this.registryPath = path.join(dataDir, "tab-registry.json");
    this.lockPath = path.join(dataDir, "tab-registry.lock");
  }

  async load(): Promise<TabEntry[]> {
    if (!fs.existsSync(this.registryPath)) return [];
    const raw = await fs.promises.readFile(this.registryPath, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`Invalid tab registry at ${this.registryPath}: expected an array`);
    return parsed;
  }

  async save(entries: TabEntry[]): Promise<void> {
    ensureDir(path.dirname(this.registryPath));
    const tmpPath = `${this.registryPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
    await fs.promises.rename(tmpPath, this.registryPath);
  }

  async register(entry: TabEntry): Promise<void> {
    await this.withLock(async () => {
      const entries = await this.load();
      const next = entries.filter((candidate) => candidate.tabId !== entry.tabId);
      next.push(entry);
      await this.save(next);
    });
  }

  async unregister(tabId: string): Promise<void> {
    await this.withLock(async () => {
      const entries = await this.load();
      await this.save(entries.filter((entry) => entry.tabId !== tabId));
    });
  }

  async get(tabId: string): Promise<TabEntry | undefined> {
    return (await this.load()).find((entry) => entry.tabId === tabId);
  }

  async list(): Promise<TabEntry[]> {
    return this.load();
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 10000;
    let handle: any;
    while (!handle) {
      try {
        handle = await fs.promises.open(this.lockPath, "wx");
      } catch (error: any) {
        if (error?.code !== "EEXIST" || Date.now() > deadline) {
          throw new Error(`Could not acquire tab registry lock at ${this.lockPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        await delay(50);
      }
    }

    try {
      return await fn();
    } finally {
      await handle.close().catch(() => undefined);
      await fs.promises.rm(this.lockPath, { force: true }).catch(() => undefined);
    }
  }
}
