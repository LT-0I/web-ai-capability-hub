import { ActionResult, BrowserAction } from "../shared/types";
import { readPageSnapshot } from "../reader/snapshot";
import { captureScreenshot } from "../reader/screenshot";
import { ConfirmationPolicy, assertActionPermitted, defaultConfirmationPolicy } from "./confirmationPolicy";
import { describeSemanticTarget, getLocator } from "./semanticTargets";
import { DownloadManager } from "../browser/downloads";
import { ArtifactStore } from "../artifacts/store";
import { beginDownloadPostcondition, PostconditionTimeoutError, waitForPostcondition } from "../browser/postconditions";

export interface ActionExecutorContext {
  getActivePage(): any | undefined;
  openUrl?(url: string): Promise<any>;
  downloads?: DownloadManager;
  profile?: string;
  tabId?: string;
  artifacts?: ArtifactStore;
}

export class ActionExecutor {
  constructor(private context: ActionExecutorContext, private policy: ConfirmationPolicy = defaultConfirmationPolicy()) {}

  async execute(action: BrowserAction): Promise<ActionResult> {
    this.validate(action);
    if (action.dryRun) return { ok: true, action, dryRun: true, message: `Dry run: ${this.describe(action)}` };
    assertActionPermitted(action, this.policy);

    switch (action.type) {
      case "open":
        return this.open(action);
      case "click":
        return this.click(action);
      case "type":
        return this.type(action);
      case "press":
        return this.press(action);
      case "select":
        return this.select(action);
      case "hover":
        return this.hover(action);
      case "select-text":
        return this.selectText(action);
      case "drag":
        return this.drag(action);
      case "upload":
        return this.upload(action);
      case "wait":
        return this.wait(action);
      case "scroll":
        return this.scroll(action);
      case "extract":
        return this.extract(action);
      case "download":
        return this.download(action);
      case "screenshot":
        return this.screenshot(action);
      default:
        throw new Error(`Unsupported action type: ${(action as any).type}`);
    }
  }

  private validate(action: BrowserAction): void {
    if (!action || typeof action !== "object") throw new Error("Action must be an object");
    if (!action.type) throw new Error("Action type is required");
    if (action.type === "open" && !action.url) throw new Error("Open action requires url");
    if (action.type === "type" && action.text === undefined) throw new Error("Type action requires text");
    if (action.type === "press" && !action.key) throw new Error("Press action requires key");
    if (action.type === "select" && !action.option) throw new Error("Select action requires option");
    if ((action.type === "hover" || action.type === "select-text") && !action.selector) throw new Error(`${action.type} action requires selector`);
    if (action.type === "hover" && action.dwellMs !== undefined && (!Number.isInteger(action.dwellMs) || action.dwellMs < 0)) throw new Error("Hover action requires dwellMs to be a non-negative integer");
    if (action.type === "select-text" && ((action.start === undefined) !== (action.end === undefined))) throw new Error("Select text action requires both start and end offsets when either is provided");
    if (action.type === "drag") {
      if (!action.selector && (!action.from || !action.to)) throw new Error("Drag action requires either selector offsets or from/to coordinates");
      if ((action.from && !action.to) || (!action.from && action.to)) throw new Error("Drag action requires both from and to coordinates");
      if (action.steps !== undefined && (!Number.isInteger(action.steps) || action.steps < 1)) throw new Error("Drag action requires steps to be a positive integer");
      if (action.holdMs !== undefined && (!Number.isInteger(action.holdMs) || action.holdMs < 0)) throw new Error("Drag action requires holdMs to be a non-negative integer");
    }
    if (action.type === "upload" && (!action.files || !action.files.length)) throw new Error("Upload action requires files");
    if (action.until && !["visible", "enabled", "stable", "download", "contentRegex"].includes(action.until)) throw new Error("Action until must be one of visible|enabled|stable|download|contentRegex");
  }

  private activePage(): any {
    const page = this.context.getActivePage();
    if (!page) throw new Error("No active browser page. Start the browser and open a page first.");
    return page;
  }

  private describe(action: BrowserAction): string {
    if (action.type === "open") return `open ${action.url}`;
    if (action.type === "screenshot") return "capture screenshot";
    return `${action.type} ${describeSemanticTarget(action.target, action.selector)}`;
  }

  private postcondition(action: BrowserAction): any | undefined {
    if (!action.until) return undefined;
    return {
      until: action.until,
      selector: action.untilSelector,
      contentRegex: action.untilContentRegex,
      stableMs: action.untilStableMs,
      timeoutMs: action.untilTimeoutMs
    };
  }

  private async runPostcondition(action: BrowserAction, pendingDownload?: Promise<Record<string, unknown>>): Promise<Record<string, unknown> | undefined> {
    const postcondition = this.postcondition(action);
    if (!postcondition) return undefined;
    try {
      return await waitForPostcondition(this.activePage(), postcondition, pendingDownload);
    } catch (error) {
      if (error instanceof PostconditionTimeoutError) {
        return { ok: false, errorCode: error.errorCode, evidence: error.evidence };
      }
      throw error;
    }
  }

  private withPostcondition(result: ActionResult, postcondition: Record<string, unknown> | undefined): ActionResult {
    if (!postcondition) return result;
    if ((postcondition as any).ok === false) return { ...result, ok: false, message: `${result.message}; postcondition timed out`, data: { ...((result.data as any) || {}), postcondition } };
    return { ...result, data: { ...((result.data as any) || {}), postcondition } };
  }

  private async open(action: BrowserAction): Promise<ActionResult> {
    const page = this.context.openUrl ? await this.context.openUrl(action.url!) : this.activePage();
    if (!this.context.openUrl) await page.goto(action.url, { waitUntil: "domcontentloaded" });
    return { ok: true, action, message: `Opened ${action.url}` };
  }

  private async click(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const locator = getLocator(page, action.target, action.selector);
    const pendingPostconditionDownload = action.until === "download" ? beginDownloadPostcondition(page) : undefined;
    if (!action.expectDownload) {
      await locator.click();
      const postcondition = await this.runPostcondition(action, pendingPostconditionDownload);
      return this.withPostcondition({ ok: true, action, message: `Clicked ${describeSemanticTarget(action.target, action.selector)}` }, postcondition);
    }

    const timeout = action.timeoutMs || 30000;
    const downloadPromise = page.waitForEvent("download", { timeout })
      .then((download: any) => ({ download }))
      .catch((error: unknown) => ({ error }));
    await locator.click();
    const result = await downloadPromise;
    if ((result as any).error) {
      return { ok: false, action, message: `No download event within ${timeout}ms`, error: `no download event within ${timeout}ms` } as any;
    }

    const download = (result as any).download;
    const record = this.context.downloads
      ? await this.context.downloads.saveDownload(download, undefined, { profile: this.context.profile, tabId: this.context.tabId })
      : { savedPath: await download.path(), suggestedFilename: await download.suggestedFilename(), sizeBytes: 0 };
    const artifact = (this.context.artifacts || new ArtifactStore()).recordFile("download", record.savedPath, {
      suggestedFilename: record.suggestedFilename,
      sourceUrl: (record as any).sourceUrl || (record as any).url || null
    });
    (record as any).artifactId = artifact.path;
    const postcondition = await this.runPostcondition(action, pendingPostconditionDownload);
    return this.withPostcondition({
      ok: true,
      action,
      message: `Downloaded ${record.suggestedFilename}`,
      data: {
        savedPath: record.savedPath,
        suggestedFilename: record.suggestedFilename,
        mimeType: (record as any).mimeType,
        bytes: (record as any).sizeBytes,
        artifactId: artifact.path
      },
      downloadPath: record.savedPath
    }, postcondition);
  }

  private async type(action: BrowserAction): Promise<ActionResult> {
    const locator = getLocator(this.activePage(), action.target, action.selector);
    if (typeof locator.fill === "function") await locator.fill(action.text || "");
    else await locator.type(action.text || "");
    return { ok: true, action, message: `Typed into ${describeSemanticTarget(action.target, action.selector)}` };
  }

  private async press(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    if (action.selector || action.target) await getLocator(page, action.target, action.selector).press(action.key);
    else await page.keyboard.press(action.key);
    return { ok: true, action, message: `Pressed ${action.key}` };
  }

  private async select(action: BrowserAction): Promise<ActionResult> {
    const locator = getLocator(this.activePage(), action.target, action.selector);
    await locator.selectOption(action.option);
    return { ok: true, action, message: `Selected ${action.option}` };
  }

  private async hover(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const locator = getLocator(page, action.target, action.selector);
    if (action.dwellMs === undefined && !action.settleSelector) {
      await locator.hover();
      const ms = action.timeoutMs || 0;
      if (ms > 0) await page.waitForTimeout(ms);
      return { ok: true, action, message: `Hovered ${describeSemanticTarget(action.target, action.selector)}` };
    }

    const dwellMs = action.dwellMs ?? 450;
    const box = await locator.boundingBox?.();
    if (!box) throw new Error(`ELEMENT_NOT_FOUND: hover target not found or not visible: ${describeSemanticTarget(action.target, action.selector)}`);
    const cdp = await page.context?.().newCDPSession?.(page);
    if (!cdp?.send) throw new Error("MODE_UNCERTAIN: raw CDP mouse input is unavailable for hover dwell");
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;
    const startX = Math.max(0, targetX - Math.max(24, Math.min(80, box.width || 24)));
    const startY = Math.max(0, targetY - Math.max(24, Math.min(80, box.height || 24)));
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: startX + (targetX - startX) * ratio,
        y: startY + (targetY - startY) * ratio,
        button: "none",
        buttons: 0
      });
    }
    if (dwellMs > 0) await page.waitForTimeout(dwellMs);
    if (action.settleSelector) {
      try {
        await page.waitForSelector(action.settleSelector, { timeout: action.timeoutMs || 5000 });
      } catch (error) {
        throw new Error(`ELEMENT_NOT_FOUND: hover dwell did not reveal settle selector ${action.settleSelector}`);
      }
    }
    const ms = action.timeoutMs || 0;
    if (ms > 0 && !action.settleSelector) await page.waitForTimeout(ms);
    await cdp.detach?.().catch?.(() => undefined);
    return {
      ok: true,
      action,
      message: `Hover-dwelled ${describeSemanticTarget(action.target, action.selector)}`,
      data: { x: targetX, y: targetY, dwellMs, mouseMovedEvents: steps }
    };
  }

  private async selectText(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const selectedText = await page.evaluate(
      ({ selector, start, end }: { selector: string; start?: number; end?: number }) => {
        const xpathSelector = selector.startsWith("xpath=") ? selector.slice("xpath=".length) : selector;
        const isXPath = selector.startsWith("xpath=") || selector.startsWith("//") || selector.startsWith("(//");
        const element = isXPath
          ? document.evaluate(xpathSelector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
          : document.querySelector(selector);
        if (!element) throw new Error(`No element matches selector: ${selector}`);

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode();
        const text = textNode?.textContent || "";
        const selection = window.getSelection();
        if (!selection) throw new Error("Selection API is unavailable");

        const range = document.createRange();
        const hasOffsets = start !== undefined && end !== undefined;
        const from = hasOffsets ? Math.max(0, Math.min(start!, text.length)) : 0;
        const to = hasOffsets ? Math.max(from, Math.min(end!, text.length)) : text.length;
        range.setStart(textNode || element, textNode ? from : 0);
        range.setEnd(textNode || element, textNode ? to : 0);
        selection.removeAllRanges();
        selection.addRange(range);
        return selection.toString();
      },
      { selector: action.selector!, start: action.start, end: action.end }
    );
    return { ok: true, action, message: `Selected text in ${describeSemanticTarget(action.target, action.selector)}`, data: { selectedText } };
  }

  private async drag(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;

    if (action.selector) {
      const box = await page.locator(action.selector).boundingBox();
      if (!box) throw new Error(`selector matched no element: ${action.selector}`);
      const [fx, fy] = action.fromOffset || [5, 5];
      const [tx, ty] = action.toOffset || [box.width - 5, box.height - 5];
      startX = box.x + fx;
      startY = box.y + fy;
      endX = box.x + tx;
      endY = box.y + ty;
    } else {
      [startX, startY] = action.from!;
      [endX, endY] = action.to!;
    }

    const steps = action.steps ?? 10;
    const holdMs = action.holdMs ?? 0;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    if (holdMs > 0) await page.waitForTimeout(holdMs);
    await page.mouse.move(endX, endY, { steps });
    await page.mouse.up();
    return {
      ok: true,
      action,
      message: `Dragged from ${startX},${startY} to ${endX},${endY}`,
      data: { startX, startY, endX, endY, steps }
    };
  }

  private async upload(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const pendingPostconditionDownload = action.until === "download" ? beginDownloadPostcondition(page) : undefined;
    const target = describeSemanticTarget(action.target, action.selector);
    const locator = getLocator(page, action.target, action.selector);
    try {
      await locator.setInputFiles(action.files);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to upload file(s) to ${target}: target must be an <input type="file"> element. ${detail}`);
    }
    const postcondition = await this.runPostcondition(action, pendingPostconditionDownload);
    return this.withPostcondition({ ok: true, action, message: `Uploaded ${action.files!.length} file(s) to ${target}` }, postcondition);
  }

  private async wait(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const pendingPostconditionDownload = action.until === "download" ? beginDownloadPostcondition(page) : undefined;
    const timeout = action.timeoutMs || 15000;
    if (action.waitFor === "text" && action.text) await page.getByText(new RegExp(action.text, "i")).first().waitFor({ timeout });
    else if (action.waitFor === "selector" && action.selector) await page.waitForSelector(action.selector, { timeout, ...(action.state ? { state: action.state } : {}) });
    else if (action.waitFor === "navigation") await page.waitForLoadState("domcontentloaded", { timeout });
    else if (action.waitFor === "timeout") await new Promise((resolve) => setTimeout(resolve, timeout));
    else await page.waitForTimeout?.(timeout);
    const postcondition = await this.runPostcondition(action, pendingPostconditionDownload);
    return this.withPostcondition({ ok: true, action, message: `Waited for ${action.waitFor || "timeout"}` }, postcondition);
  }

  private async scroll(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const delta = action.amount || 800;
    const y = action.direction === "up" ? -delta : delta;
    await page.mouse?.wheel?.(0, y);
    if (!page.mouse?.wheel) await page.evaluate((amount: number) => window.scrollBy(0, amount), y);
    return { ok: true, action, message: `Scrolled ${action.direction || "down"}` };
  }

  private async extract(action: BrowserAction): Promise<ActionResult> {
    const snapshot = await readPageSnapshot(this.activePage(), { includeAccessibility: false });
    const data = action.extract === "table" ? snapshot.tables : action.extract === "list" ? snapshot.lists : action.extract === "text" ? snapshot.visibleText : snapshot;
    return { ok: true, action, message: `Extracted ${action.extract || "snapshot"}`, data };
  }

  private async download(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: action.timeoutMs || 30000 }),
      getLocator(page, action.target, action.selector).click()
    ]);
    const record = this.context.downloads ? await this.context.downloads.saveDownload(download) : { savedPath: await download.path(), suggestedFilename: await download.suggestedFilename() };
    return { ok: true, action, message: `Downloaded ${record.suggestedFilename}`, data: record, downloadPath: record.savedPath };
  }

  private async screenshot(action: BrowserAction): Promise<ActionResult> {
    const screenshotPath = await captureScreenshot(this.activePage());
    return { ok: true, action, message: "Captured screenshot", screenshotPath };
  }
}
