const path = require("node:path");
import { getStoragePaths } from "../utils/paths";

export type PostconditionKind = "visible" | "enabled" | "stable" | "download" | "contentRegex";

export interface ActionPostcondition {
  until?: PostconditionKind;
  selector?: string;
  contentRegex?: string;
  stableMs?: number;
  timeoutMs?: number;
}

export class PostconditionTimeoutError extends Error {
  readonly errorCode = "POSTCONDITION_TIMEOUT";
  constructor(message: string, readonly evidence: Record<string, unknown> = {}) { super(message); }
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sameBox(a: any, b: any): boolean {
  if (!a || !b) return false;
  return ["x", "y", "width", "height"].every((key) => Math.abs(Number(a[key]) - Number(b[key])) < 0.5);
}

function observed(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value.slice(0, 500);
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value); }
}

export async function beginDownloadPostcondition(page: any, downloadPath = getStoragePaths().downloadDir): Promise<Record<string, unknown>> {
  const browser = page?.context?.()?.browser?.() || page?.browser?.();
  if (!browser?.newBrowserCDPSession) throw new Error("INVALID_ARGS: Browser-level CDP download postcondition requires Playwright Chromium CDP browser session");
  const session = await browser.newBrowserCDPSession();
  if (typeof session.send !== "function") throw new Error("INVALID_ARGS: Browser.setDownloadBehavior is unavailable on this browser session");
  await session.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: path.resolve(downloadPath), eventsEnabled: true });
  return new Promise((resolve) => {
    session.on?.("Browser.downloadWillBegin", (event: any) => resolve({ guid: event?.guid, suggestedFilename: event?.suggestedFilename, url: event?.url }));
  });
}

export async function waitForPostcondition(page: any, postcondition: ActionPostcondition, pendingDownload?: Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  if (!postcondition.until) return {};
  const timeoutMs = postcondition.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;
  const pollMs = 250;
  let lastObserved: unknown;

  if (postcondition.until === "download") {
    const pending = pendingDownload || await beginDownloadPostcondition(page);
    return await Promise.race([
      pending,
      sleep(timeoutMs).then(() => { throw new PostconditionTimeoutError(`Postcondition download timed out after ${timeoutMs}ms`, { observedState: "no Browser.downloadWillBegin" }); })
    ]);
  }

  if (!postcondition.selector) throw new Error(`INVALID_ARGS: --until-selector is required for until=${postcondition.until}`);
  const locator = page.locator(postcondition.selector);

  if (postcondition.until === "contentRegex" && !postcondition.contentRegex) throw new Error("INVALID_ARGS: --until-content-regex is required for until=contentRegex");
  const regex = postcondition.contentRegex ? new RegExp(postcondition.contentRegex) : undefined;
  const stableMs = postcondition.stableMs ?? 1000;
  let stableSince = 0;
  let previousBox: any;

  while (Date.now() <= deadline) {
    try {
      if (postcondition.until === "visible") {
        const visible = typeof locator.isVisible === "function" ? await locator.isVisible() : !!(await locator.boundingBox?.());
        lastObserved = { visible };
        if (visible) return { observedState: "visible" };
      } else if (postcondition.until === "enabled") {
        let enabled = typeof locator.isEnabled === "function" ? await locator.isEnabled() : undefined;
        if (enabled === undefined && typeof locator.getAttribute === "function") enabled = (await locator.getAttribute("disabled")) == null;
        lastObserved = { enabled };
        if (enabled) return { observedState: "enabled" };
      } else if (postcondition.until === "stable") {
        const box = await locator.boundingBox?.();
        lastObserved = { box };
        if (box && previousBox && sameBox(box, previousBox)) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince >= stableMs) return { observedState: "stable", box };
        } else {
          stableSince = 0;
          previousBox = box;
        }
      } else if (postcondition.until === "contentRegex") {
        const text = typeof locator.textContent === "function" ? await locator.textContent() : "";
        lastObserved = text || "";
        if (regex!.test(text || "")) return { observedState: "matched", text };
      }
    } catch (error) {
      lastObserved = error instanceof Error ? error.message : String(error);
    }
    await sleep(pollMs);
  }
  throw new PostconditionTimeoutError(`Postcondition ${postcondition.until} timed out after ${timeoutMs}ms`, { observedState: observed(lastObserved) });
}
