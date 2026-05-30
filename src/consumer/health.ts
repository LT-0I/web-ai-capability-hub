import { CdpPageInfo, ManagedBrowserLauncher, ManagedBrowserStatus } from "../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../runtime/pool/profilePool";
import { getWebAiAdapter } from "../adapters/web-ai";
import { ConsumerErrorCode, ConsumerErrorCodes } from "./errorCodes";

export type ConsumerHealthLoginLikeState = "healthy" | "unhealthy" | "not_implemented";
export type ConsumerHealthStatus = "ok" | "missing" | "blocked" | "needs_review";

export interface ConsumerHealthResult {
  ok: boolean;
  target: string;
  profile: string;
  connected: boolean;
  pageCount: number;
  loginLikeState: ConsumerHealthLoginLikeState;
  status: ConsumerHealthStatus;
  errorCode: ConsumerErrorCode | null;
  message: string;
  checkedAt: string;
}

export interface ConsumerHealthLauncher {
  status(profile?: string): Promise<ManagedBrowserStatus>;
  profileStore?: { list(): Array<{ profileName?: string }> };
}

export interface ConsumerHealthOptions {
  target: string;
  profile: string;
  launcher?: ConsumerHealthLauncher;
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 3500;

const TARGET_HOST_ALIASES: Record<string, string[]> = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"]
};

// SANCTIONED health-probe-only aliases. CLAUDE.md §5 bans `--profile claude`
// for real webai:* flows; this map ONLY rewrites the profile for the
// read-only consumer-health target resolution so an external watchdog
// probing the legacy `claude` name reaches the canonical logged-in
// claude-9224 session. It never launches/logs into 9222 and never affects
// ManagedBrowserLauncher or any tool.
// Similarly, `--profile gemini` (friendly name) is rewritten to `gemini-9225`
// (the canonical logged-in Gemini session on CDP port 9225). Read-only;
// never launches/logs in; never affects ManagedBrowserLauncher or any tool.
const HEALTH_PROFILE_ALIASES: Record<string, Record<string, string>> = {
  claude: { claude: "claude-9224" },
  gemini: { gemini: "gemini-9225" }
};

export async function consumerHealth(options: ConsumerHealthOptions): Promise<ConsumerHealthResult> {
  const target = (options.target || "").trim();
  const profile = (options.profile || "").trim();
  const checkedAt = (options.now ? options.now() : new Date()).toISOString();

  if (!target || !profile) {
    return result({
      target,
      profile,
      checkedAt,
      ok: false,
      connected: false,
      pageCount: 0,
      loginLikeState: "not_implemented",
      status: "needs_review",
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: "Missing required target or profile."
    });
  }

  const requestedProfile = profile;
  const resolvedProfile =
    HEALTH_PROFILE_ALIASES[target.toLowerCase()]?.[requestedProfile] ?? requestedProfile;

  const launcher = options.launcher || createManagedBrowserLauncher();
  const profileKnown = knownProfileBeforeCheck(launcher, resolvedProfile);
  let status: ManagedBrowserStatus;

  try {
    status = await withTimeout(launcher.status(resolvedProfile), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    const timeout = error instanceof Error && error.name === "ConsumerHealthTimeoutError";
    return result({
      target,
      profile: resolvedProfile,
      checkedAt,
      ok: false,
      connected: false,
      pageCount: 0,
      loginLikeState: "not_implemented",
      status: "needs_review",
      errorCode: timeout ? ConsumerErrorCodes.COMMAND_TIMEOUT : ConsumerErrorCodes.UNKNOWN,
      message: timeout ? "Timed out while checking managed browser health." : "Unable to complete consumer health check."
    });
  }

  const pages = safePages(status.pages);
  if (!status.connected) {
    const errorCode = profileKnown === false ? ConsumerErrorCodes.PROFILE_NOT_FOUND : ConsumerErrorCodes.BROWSER_NOT_LAUNCHED;
    return result({
      target,
      profile: resolvedProfile,
      checkedAt,
      ok: false,
      connected: false,
      pageCount: pages.length,
      loginLikeState: "not_implemented",
      status: "missing",
      errorCode,
      message: errorCode === ConsumerErrorCodes.PROFILE_NOT_FOUND
        ? "Managed browser profile metadata was not found."
        : "Managed browser is not connected for the requested profile."
    });
  }

  const targetPage = findTargetPage(pages, target);
  if (!targetPage) {
    return result({
      target,
      profile: resolvedProfile,
      checkedAt,
      ok: false,
      connected: true,
      pageCount: pages.length,
      loginLikeState: "not_implemented",
      status: "missing",
      errorCode: ConsumerErrorCodes.TARGET_PAGE_MISSING,
      message: "Connected browser has no matching target page."
    });
  }

  if (pageLooksLoginLike(targetPage)) {
    return result({
      target,
      profile: resolvedProfile,
      checkedAt,
      ok: false,
      connected: true,
      pageCount: pages.length,
      loginLikeState: "unhealthy",
      status: "blocked",
      errorCode: ConsumerErrorCodes.LOGIN_REQUIRED,
      message: "Target page appears blocked by login or access review."
    });
  }

  return result({
    target,
    profile: resolvedProfile,
    checkedAt,
    ok: true,
    connected: true,
    pageCount: pages.length,
    loginLikeState: "healthy",
    status: "ok",
    errorCode: null,
    message: "Target page is reachable through the managed browser profile."
  });
}

function result(value: ConsumerHealthResult): ConsumerHealthResult {
  return {
    ok: value.ok,
    target: value.target,
    profile: value.profile,
    connected: value.connected,
    pageCount: value.pageCount,
    loginLikeState: value.loginLikeState,
    status: value.status,
    errorCode: value.errorCode,
    message: value.message,
    checkedAt: value.checkedAt
  };
}

function knownProfileBeforeCheck(launcher: ConsumerHealthLauncher, profile: string): boolean | undefined {
  try {
    const profiles = launcher.profileStore?.list?.();
    if (!profiles) return undefined;
    return profiles.some((item) => item.profileName === profile);
  } catch {
    return undefined;
  }
}

function safePages(pages: ManagedBrowserStatus["pages"]): CdpPageInfo[] {
  return Array.isArray(pages) ? pages : [];
}

function targetHosts(target: string): string[] {
  const normalized = target.toLowerCase();
  const hosts = new Set(TARGET_HOST_ALIASES[normalized] || []);
  const adapterHost = hostFromUrl(getWebAiAdapter(normalized)?.baseUrl);
  if (adapterHost) hosts.add(adapterHost);
  return Array.from(hosts);
}

function findTargetPage(pages: CdpPageInfo[], target: string): CdpPageInfo | undefined {
  const hosts = targetHosts(target);
  if (!hosts.length) return undefined;
  return pages.find((page) => {
    if (page.type && page.type !== "page") return false;
    const host = hostFromUrl(page.url);
    return !!host && hosts.some((targetHost) => host === targetHost || host.endsWith(`.${targetHost}`));
  });
}

function pageLooksLoginLike(page: CdpPageInfo): boolean {
  const text = `${page.title || ""} ${page.url || ""}`.replace(/\s+/g, " ").toLowerCase();
  if (!text.trim()) return false;
  return [
    /\bsign[-\s]?in\b/,
    /\blog[-\s]?in\b/,
    /\/auth\b/,
    /\/login\b/,
    /\/signin\b/,
    /\bcaptcha\b/,
    /\baccess denied\b/,
    /\bforbidden\b/,
    /\bunauthorized\b/,
    /\b(401|403|429)\b/
  ].some((pattern) => pattern.test(text));
}

function hostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return undefined; }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Timed out after ${timeoutMs}ms`);
      error.name = "ConsumerHealthTimeoutError";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
