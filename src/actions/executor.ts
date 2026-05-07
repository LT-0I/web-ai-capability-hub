import { ActionResult, BrowserAction } from "../shared/types";
import { readPageSnapshot } from "../reader/snapshot";
import { captureScreenshot } from "../reader/screenshot";
import { ConfirmationPolicy, assertActionPermitted, defaultConfirmationPolicy } from "./confirmationPolicy";
import { describeSemanticTarget, getLocator } from "./semanticTargets";
import { DownloadManager } from "../browser/downloads";

export interface ActionExecutorContext {
  getActivePage(): any | undefined;
  openUrl?(url: string): Promise<any>;
  downloads?: DownloadManager;
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
    if (action.type === "upload" && (!action.files || !action.files.length)) throw new Error("Upload action requires files");
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

  private async open(action: BrowserAction): Promise<ActionResult> {
    const page = this.context.openUrl ? await this.context.openUrl(action.url!) : this.activePage();
    if (!this.context.openUrl) await page.goto(action.url, { waitUntil: "domcontentloaded" });
    return { ok: true, action, message: `Opened ${action.url}` };
  }

  private async click(action: BrowserAction): Promise<ActionResult> {
    const locator = getLocator(this.activePage(), action.target, action.selector);
    await locator.click();
    return { ok: true, action, message: `Clicked ${describeSemanticTarget(action.target, action.selector)}` };
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

  private async upload(action: BrowserAction): Promise<ActionResult> {
    const locator = getLocator(this.activePage(), action.target, action.selector);
    await locator.setInputFiles(action.files);
    return { ok: true, action, message: `Uploaded ${action.files!.length} file(s)` };
  }

  private async wait(action: BrowserAction): Promise<ActionResult> {
    const page = this.activePage();
    const timeout = action.timeoutMs || 15000;
    if (action.waitFor === "text" && action.text) await page.getByText(new RegExp(action.text, "i")).first().waitFor({ timeout });
    else if (action.waitFor === "selector" && action.selector) await page.waitForSelector(action.selector, { timeout });
    else if (action.waitFor === "navigation") await page.waitForLoadState("domcontentloaded", { timeout });
    else if (action.waitFor === "timeout") await new Promise((resolve) => setTimeout(resolve, timeout));
    else await page.waitForTimeout?.(timeout);
    return { ok: true, action, message: `Waited for ${action.waitFor || "timeout"}` };
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
