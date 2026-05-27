const fs = require("node:fs");
const path = require("node:path");
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { safeProfileName } from "../../../browser/profileStore";
import { createManagedBrowserLauncher } from "../../../runtime/pool/profilePool";
import { firstBrowserContext } from "../../../browser/managedPageRouting";
import { LiteratureDownloadError } from "./arxiv";

export const INCOPAT_LOGIN_URL = "https://www.incopat.com/newLogin";
const INCOPAT_ORIGIN = "https://www.incopat.com";
const INCOPAT_IP_LOGIN_SELECTOR = "#ipLoginBtn";
const INCOPAT_SEARCH_SELECTOR = "#searchValue";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now(): number {
  return Date.now();
}

function directoryHasExistingState(dir: string | undefined): boolean {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name: string) => name !== "DevToolsActivePort" && !name.startsWith("Singleton"));
  } catch {
    return false;
  }
}

function hasRegisteredOrExistingProfileState(launcher: any, profile: string): boolean {
  const record = launcher?.profileStore?.list?.().find((entry: any) => entry?.profileName === profile);
  if (directoryHasExistingState(record?.profileDir)) return true;
  const root = launcher?.profileStore?.profilesRoot;
  return directoryHasExistingState(root ? path.join(root, safeProfileName(profile)) : undefined);
}

async function visibleSelector(page: any, selector: string): Promise<boolean> {
  return await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }, selector).catch(() => false);
}

async function incopatAuthState(page: any): Promise<Record<string, unknown>> {
  const dom = await page.evaluate((searchSelector: string, loginSelector: string) => {
    const search = document.querySelector(searchSelector) as HTMLElement | null;
    const login = document.querySelector(loginSelector) as HTMLElement | null;
    const visible = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    return {
      url: location.href,
      title: document.title,
      hasSearch: visible(search),
      hasLogin: visible(login),
      bodyText: (document.body?.innerText || "").slice(0, 1000)
    };
  }, INCOPAT_SEARCH_SELECTOR, INCOPAT_IP_LOGIN_SELECTOR).catch(() => ({
    url: page.url?.() || "",
    title: "",
    hasSearch: false,
    hasLogin: false,
    bodyText: ""
  }));
  const cookies = await page.context?.()?.cookies?.(INCOPAT_ORIGIN).catch(() => []);
  const sessionCookieNames = (cookies || [])
    .map((cookie: any) => String(cookie?.name || ""))
    .filter((name: string) => /^(?:JSESSIONID|SESSION)$/i.test(name));
  return {
    ...dom,
    hasSessionCookie: sessionCookieNames.length > 0,
    sessionCookieNames
  };
}

async function waitForIncopatSessionMarker(page: any, timeoutMs: number): Promise<Record<string, unknown>> {
  const deadline = now() + Math.max(1, timeoutMs);
  let lastState: Record<string, unknown> = {};
  while (now() <= deadline) {
    const state = await incopatAuthState(page);
    lastState = state;
    if (state.hasSessionCookie && state.hasSearch) return state;
    await sleep(500);
  }
  return lastState;
}

async function trustedClick(page: any, selector: string): Promise<void> {
  const box = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView?.({ block: "center", inline: "center" });
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      text: (el.innerText || el.getAttribute("value") || "").trim()
    };
  }, selector).catch(() => null);
  if (!box || !box.width || !box.height) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      "IncoPat IP-login button was not found",
      { selector, url: page.url?.() || "" }
    );
  }
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

export async function ensureIncopatIpLogin(page: any, timeoutMs = 10000): Promise<void> {
  try {
    await page.goto(INCOPAT_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState?.("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
  } catch (error) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.COMMAND_TIMEOUT,
      `IncoPat IP-login page navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      { url: INCOPAT_LOGIN_URL }
    );
  }

  const alreadyAuthenticated = await waitForIncopatSessionMarker(page, 1000);
  if (alreadyAuthenticated.hasSessionCookie && alreadyAuthenticated.hasSearch) return;

  const buttonDeadline = now() + 5000;
  while (now() <= buttonDeadline && !(await visibleSelector(page, INCOPAT_IP_LOGIN_SELECTOR))) {
    await sleep(250);
  }
  await trustedClick(page, INCOPAT_IP_LOGIN_SELECTOR);

  const state = await waitForIncopatSessionMarker(page, timeoutMs);
  if (state.hasSessionCookie && state.hasSearch) return;
  throw new LiteratureDownloadError(
    ConsumerErrorCodes.LOGIN_REQUIRED,
    "IncoPat trusted IP-login did not reach the authenticated app",
    { selector: INCOPAT_IP_LOGIN_SELECTOR, expected: "JSESSIONID/SESSION cookie plus visible #searchValue", ...state }
  );
}

export async function ensureIncopatIpLoginForProfile(profile: string, cdpPort?: number): Promise<void> {
  const launcher = createManagedBrowserLauncher();
  if (!cdpPort && !hasRegisteredOrExistingProfileState(launcher, profile)) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.PROFILE_NOT_FOUND,
      `Authenticated research browser profile "${profile}" is not registered or initialized; refusing to spawn a fresh logged-out Chrome for IncoPat IP-login`,
      { profile }
    );
  }
  let browser: any;
  try {
    const status = await launcher.launch({ profile, cdpPort });
    browser = await launcher.connectOverCdp(status);
  } catch (error) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.COMMAND_TIMEOUT,
      `IncoPat IP-login browser session could not be opened: ${error instanceof Error ? error.message : String(error)}`,
      { profile, cdp_port: cdpPort }
    );
  }
  try {
    const context = await firstBrowserContext(browser);
    const page = await context.newPage();
    try {
      await ensureIncopatIpLogin(page);
    } finally {
      await page.close?.().catch(() => undefined);
    }
  } finally {
    await browser.close?.().catch(() => undefined);
  }
}
