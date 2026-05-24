import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConsumerErrorCode, ConsumerErrorCodes } from "../../consumer/errorCodes";

export const DEFAULT_EXTENSION_HOST_NAME = "com.chromemcp.nativehost";
export const DEFAULT_EXTENSION_DESCRIPTION = "Chrome MCP native messaging host";
export const DEFAULT_EXTENSION_BUILD_MANIFEST = "vendor/mcp-chrome/app/chrome-extension/.output/chrome-mv3/manifest.json";
export const DEFAULT_NATIVE_SERVER = "vendor/mcp-chrome/app/native-server/dist/native-messaging-host.js";

export interface InstallOptions {
  chromeProfileDir?: string;
  hostName?: string;
  nativeServerPath?: string;
  allowedExtensionIds?: string[];
  dryRun?: boolean;
}

export interface VerifyOptions {
  chromeProfileDir?: string;
  hostName?: string;
}

export interface UninstallOptions {
  chromeProfileDir?: string;
  hostName?: string;
}

export interface NativeMessagingHostManifest {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
}

export type InstallResult =
  | {
      ok: true;
      manifestPath: string;
      hostName: string;
      nativeServerPath: string;
      allowedOrigins: string[];
    }
  | {
      ok: false;
      errorCode: ConsumerErrorCode;
      message: string;
      manifestPath?: string;
    };

export type VerifyResult = {
  ok: boolean;
  missingChecks: string[];
  manifestPath: string;
  nativeServerPath: string;
};

export type UninstallResult = {
  ok: true;
  manifestPath: string;
  deleted: boolean;
};

function repoPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

export function defaultChromeProfileDir(platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  const home = os.homedir();
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Google", "Chrome");
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, "Google", "Chrome", "User Data");
  }
  return path.join(home, ".config", "google-chrome");
}

function normalizeHostName(hostName: string): string | undefined {
  const trimmed = hostName.trim();
  if (!/^[a-z0-9_.]+$/.test(trimmed)) return undefined;
  if (trimmed.startsWith(".") || trimmed.endsWith(".") || trimmed.includes("..")) return undefined;
  return trimmed;
}

function normalizeExtensionId(id: string): string | undefined {
  const trimmed = id.trim();
  if (!trimmed || /[\s/*]/.test(trimmed)) return undefined;
  return trimmed;
}

function extensionIdFromManifestKey(key: string): string | undefined {
  try {
    const der = Buffer.from(key, "base64");
    if (der.length === 0) return undefined;
    const digest = crypto.createHash("sha256").update(der).digest();
    const alphabet = "abcdefghijklmnop";
    let id = "";
    for (const byte of digest.subarray(0, 16)) {
      id += alphabet[(byte >> 4) & 0x0f];
      id += alphabet[byte & 0x0f];
    }
    return id;
  } catch {
    return undefined;
  }
}

export function readExtensionIdsFromBuiltManifest(manifestPath = repoPath(DEFAULT_EXTENSION_BUILD_MANIFEST)): string[] {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const rawIds = [
      manifest.id,
      manifest.extension_id,
      manifest.chrome_extension_id,
      manifest.key ? extensionIdFromManifestKey(String(manifest.key)) : undefined
    ].filter((value) => typeof value === "string") as string[];
    return Array.from(new Set(rawIds.map((id) => normalizeExtensionId(id)).filter(Boolean) as string[]));
  } catch {
    return [];
  }
}

function resolveAllowedExtensionIds(options: InstallOptions): string[] | InstallResult {
  const explicit = options.allowedExtensionIds;
  const ids = explicit === undefined ? readExtensionIdsFromBuiltManifest() : explicit;
  if (!ids.length) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: explicit === undefined
        ? `allowedExtensionIds could not be determined from ${repoPath(DEFAULT_EXTENSION_BUILD_MANIFEST)}; pass --extension-id explicitly`
        : "allowedExtensionIds must contain at least one extension id"
    };
  }

  const normalized = ids.map((id) => normalizeExtensionId(String(id)));
  const invalid = normalized.findIndex((id) => !id);
  if (invalid >= 0) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: `allowedExtensionIds[${invalid}] is invalid; extension ids must be non-empty and must not contain whitespace, slash, or wildcard characters`
    };
  }
  return Array.from(new Set(normalized as string[]));
}

function manifestPathFor(chromeProfileDir: string, hostName: string): string {
  return path.join(chromeProfileDir, "NativeMessagingHosts", `${hostName}.json`);
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try { fs.rmSync(tmpPath, { force: true }); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export function allowedOriginsForExtensionIds(extensionIds: string[]): string[] {
  return extensionIds.map((id) => `chrome-extension://${id}/`);
}

export function createNativeMessagingHostManifest(
  hostName: string,
  nativeServerPath: string,
  allowedOrigins: string[]
): NativeMessagingHostManifest {
  return {
    name: hostName,
    description: DEFAULT_EXTENSION_DESCRIPTION,
    path: nativeServerPath,
    type: "stdio",
    allowed_origins: allowedOrigins
  };
}

export function installExtensionHost(options: InstallOptions = {}): InstallResult {
  const hostName = normalizeHostName(options.hostName || DEFAULT_EXTENSION_HOST_NAME);
  if (!hostName) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: `hostName is invalid; native messaging host names must use lowercase letters, digits, underscores, and dots`
    };
  }

  const chromeProfileDir = path.resolve(options.chromeProfileDir || defaultChromeProfileDir());
  const manifestPath = manifestPathFor(chromeProfileDir, hostName);
  if (!fs.existsSync(chromeProfileDir) || !fs.statSync(chromeProfileDir).isDirectory()) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
      message: `Chrome profile directory does not exist: ${chromeProfileDir}`,
      manifestPath
    };
  }

  const nativeServerPath = path.resolve(options.nativeServerPath || repoPath(DEFAULT_NATIVE_SERVER));
  if (!fs.existsSync(nativeServerPath) || !fs.statSync(nativeServerPath).isFile()) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
      message: `Native messaging server does not exist: ${nativeServerPath}`,
      manifestPath
    };
  }

  const allowedIds = resolveAllowedExtensionIds(options);
  if (!Array.isArray(allowedIds)) return { ...allowedIds, manifestPath };

  const allowedOrigins = allowedOriginsForExtensionIds(allowedIds);
  const manifest = createNativeMessagingHostManifest(hostName, nativeServerPath, allowedOrigins);

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    atomicWriteJson(manifestPath, manifest);
  }

  return {
    ok: true,
    manifestPath,
    hostName,
    nativeServerPath,
    allowedOrigins
  };
}

export function verifyExtensionHost(options: VerifyOptions = {}): VerifyResult {
  const chromeProfileDir = path.resolve(options.chromeProfileDir || defaultChromeProfileDir());
  const hostName = normalizeHostName(options.hostName || DEFAULT_EXTENSION_HOST_NAME);
  if (!hostName) {
    return {
      ok: false,
      missingChecks: ["host_name_invalid"],
      manifestPath: manifestPathFor(chromeProfileDir, DEFAULT_EXTENSION_HOST_NAME),
      nativeServerPath: ""
    };
  }
  const manifestPath = manifestPathFor(chromeProfileDir, hostName);
  const missingChecks: string[] = [];
  let nativeServerPath = "";

  if (!fs.existsSync(chromeProfileDir) || !fs.statSync(chromeProfileDir).isDirectory()) {
    missingChecks.push("chrome_profile_dir_missing");
  }

  if (!fs.existsSync(manifestPath)) {
    missingChecks.push("manifest_missing");
    return { ok: false, missingChecks, manifestPath, nativeServerPath };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    missingChecks.push("manifest_invalid_json");
    return { ok: false, missingChecks, manifestPath, nativeServerPath };
  }

  if (manifest?.name !== hostName) missingChecks.push("manifest_name_mismatch");
  if (manifest?.type !== "stdio") missingChecks.push("manifest_type_not_stdio");
  if (!Array.isArray(manifest?.allowed_origins) || manifest.allowed_origins.length === 0) {
    missingChecks.push("allowed_origins_missing");
  }

  nativeServerPath = typeof manifest?.path === "string" ? manifest.path : "";
  if (!nativeServerPath) {
    missingChecks.push("native_server_path_missing");
  } else if (!fs.existsSync(nativeServerPath) || !fs.statSync(nativeServerPath).isFile()) {
    missingChecks.push("native_server_missing");
  } else {
    try {
      fs.accessSync(nativeServerPath, fs.constants.X_OK);
    } catch {
      missingChecks.push("native_server_not_executable");
    }
  }

  return { ok: missingChecks.length === 0, missingChecks, manifestPath, nativeServerPath };
}

export function uninstallExtensionHost(options: UninstallOptions = {}): UninstallResult {
  const chromeProfileDir = path.resolve(options.chromeProfileDir || defaultChromeProfileDir());
  const hostName = normalizeHostName(options.hostName || DEFAULT_EXTENSION_HOST_NAME);
  if (!hostName) {
    return { ok: true, manifestPath: manifestPathFor(chromeProfileDir, DEFAULT_EXTENSION_HOST_NAME), deleted: false };
  }
  const manifestPath = manifestPathFor(chromeProfileDir, hostName);
  const existed = fs.existsSync(manifestPath);
  if (existed) fs.rmSync(manifestPath, { force: true });
  return { ok: true, manifestPath, deleted: existed };
}
