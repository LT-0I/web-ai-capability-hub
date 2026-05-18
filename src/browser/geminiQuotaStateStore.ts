const fs = require("node:fs");
const path = require("node:path");
import { ensureDir, getStoragePaths } from "../utils/paths";

export interface GeminiQuotaAccountState {
  exhausted_at: string;
  cooldown_until: string;
  last_error: string;
}

interface GeminiQuotaStateFile {
  version: number;
  accounts: Record<string, GeminiQuotaAccountState>;
}

function nowIso(now = new Date()): string { return now.toISOString(); }

function cooldownHours(): number {
  const value = Number(process.env.WAH_GEMINI_QUOTA_COOLDOWN_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

export class GeminiQuotaStateStore {
  readonly profilesRoot: string;
  readonly statePath: string;
  private readonly now: () => Date;

  constructor(root = process.cwd(), options: { now?: () => Date } = {}) {
    const storage = getStoragePaths(root);
    this.profilesRoot = ensureDir(path.join(storage.dataDir, "browser-profiles"));
    this.statePath = path.join(this.profilesRoot, "gemini-quota-state.json");
    this.now = options.now || (() => new Date());
  }

  isCooledDown(profile: string): boolean {
    const file = this.readAndPrune();
    return Boolean(file.accounts[profile]);
  }

  markExhausted(profile: string, code: string): void {
    const file = this.readAndPrune();
    const exhaustedAt = this.now();
    const cooldownUntil = new Date(exhaustedAt.getTime() + cooldownHours() * 60 * 60 * 1000);
    file.accounts[profile] = {
      exhausted_at: nowIso(exhaustedAt),
      cooldown_until: nowIso(cooldownUntil),
      last_error: code
    };
    this.write(file);
  }

  clear(profile: string): void {
    const file = this.readAndPrune();
    if (!file.accounts[profile]) return;
    delete file.accounts[profile];
    this.write(file);
  }

  private readAndPrune(): GeminiQuotaStateFile {
    const file = this.read();
    const nowMs = this.now().getTime();
    let changed = false;
    for (const [profile, state] of Object.entries(file.accounts)) {
      const until = Date.parse(state.cooldown_until);
      if (!Number.isFinite(until) || nowMs >= until) {
        delete file.accounts[profile];
        changed = true;
      }
    }
    if (changed) this.write(file);
    return file;
  }

  private read(): GeminiQuotaStateFile {
    if (!fs.existsSync(this.statePath)) return { version: 1, accounts: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
      const accounts = parsed && typeof parsed.accounts === "object" && !Array.isArray(parsed.accounts) ? parsed.accounts : {};
      return { version: parsed.version || 1, accounts };
    } catch {
      return { version: 1, accounts: {} };
    }
  }

  private write(file: GeminiQuotaStateFile): void {
    ensureDir(path.dirname(this.statePath));
    fs.writeFileSync(this.statePath, JSON.stringify({ version: 1, accounts: file.accounts }, null, 2), "utf-8");
  }
}
