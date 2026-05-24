import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { ConsumerErrorCode, ConsumerErrorCodes } from "../../../src/consumer/errorCodes";
import {
  DEFAULT_EXTENSION_BUILD_MANIFEST,
  DEFAULT_EXTENSION_HOST_NAME,
  DEFAULT_NATIVE_SERVER,
  installExtensionHost,
  readExtensionIdsFromBuiltManifest,
  uninstallExtensionHost
} from "../../../src/runtime/extension/installHost";

export interface UseExtensionChromeOptions {
  headless?: boolean;
  extensionDir?: string;
  extensionId?: string;
  hostName?: string;
  nativeServerPath?: string;
}

export type UseExtensionChromeResult =
  | {
      ok: true;
      context: BrowserContext;
      page: Page;
      extensionId: string;
      nativeServerPath: string;
      cleanup: () => Promise<void>;
    }
  | {
      ok: false;
      errorCode: ConsumerErrorCode;
      message: string;
    };

function loadChromium(): typeof import("playwright").chromium {
  try {
    // Prefer @playwright/test when the repo has it installed; this keeps the
    // fixture compatible with Playwright test suites without adding a root dep.
    return require("@playwright/test").chromium;
  } catch {
    return require("playwright").chromium;
  }
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function useExtensionChrome(options: UseExtensionChromeOptions = {}): Promise<UseExtensionChromeResult> {
  const extensionDir = path.resolve(options.extensionDir || path.dirname(path.resolve(process.cwd(), DEFAULT_EXTENSION_BUILD_MANIFEST)));
  const extensionManifestPath = path.join(extensionDir, "manifest.json");
  if (!fs.existsSync(extensionManifestPath)) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
      message: `Built Chrome extension manifest is missing: ${extensionManifestPath}. Run pnpm -C vendor/mcp-chrome/app/chrome-extension build first.`
    };
  }

  const extensionId = options.extensionId || readExtensionIdsFromBuiltManifest(extensionManifestPath)[0];
  if (!extensionId) {
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.INVALID_ARGS,
      message: `Built Chrome extension manifest does not contain a pinned extension id or key: ${extensionManifestPath}; pass extensionId explicitly.`
    };
  }

  const nativeServerPath = path.resolve(options.nativeServerPath || DEFAULT_NATIVE_SERVER);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wah-ext-profile-"));
  const hostName = options.hostName || DEFAULT_EXTENSION_HOST_NAME;

  const installResult = installExtensionHost({
    chromeProfileDir: userDataDir,
    hostName,
    nativeServerPath,
    allowedExtensionIds: [extensionId]
  });
  if (!installResult.ok) {
    rmDir(userDataDir);
    return installResult;
  }

  let context: BrowserContext | undefined;
  try {
    const chromium = loadChromium();
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: options.headless ?? false,
      args: [
        `--load-extension=${extensionDir}`,
        `--disable-extensions-except=${extensionDir}`,
        `--user-data-dir=${userDataDir}`
      ]
    });
    const page = context.pages()[0] || await context.newPage();

    return {
      ok: true,
      context,
      page,
      extensionId,
      nativeServerPath,
      cleanup: async () => {
        await context?.close().catch(() => undefined);
        uninstallExtensionHost({ chromeProfileDir: userDataDir, hostName });
        rmDir(userDataDir);
      }
    };
  } catch (error: any) {
    await context?.close().catch(() => undefined);
    uninstallExtensionHost({ chromeProfileDir: userDataDir, hostName });
    rmDir(userDataDir);
    return {
      ok: false,
      errorCode: ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
      message: error?.message || String(error)
    };
  }
}
