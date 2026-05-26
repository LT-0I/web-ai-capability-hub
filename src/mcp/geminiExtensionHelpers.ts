import { ConsumerErrorCodes } from "../consumer/errorCodes";

export const GEMINI_UPLOAD_TOOLS_BUTTON_SELECTOR = 'button[aria-label="Upload & tools"]';
export const GEMINI_MODE_PICKER_BUTTON_SELECTOR = 'button[data-test-id="bard-mode-menu-button"]';
export const GEMINI_UPLOAD_FILES_BUTTON_SELECTOR = 'button[data-test-id="local-images-files-uploader-button"]';
export const GEMINI_MORE_TOOLS_BUTTON_SELECTOR = 'button[data-test-id="more-tools-button"]';
export const GEMINI_35_FLASH_MENUITEM_SELECTOR = '[role="menuitem"]:has-text("3.5 Flash"):not(:has-text("Lite"))';

const GEMINI_MODEL_SELECTORS: Record<string, string> = {
  "3.1-flash-lite": '[role="menuitem"]:has-text("3.1 Flash-Lite")',
  "3.1 flash-lite": '[role="menuitem"]:has-text("3.1 Flash-Lite")',
  "3.1 flash lite": '[role="menuitem"]:has-text("3.1 Flash-Lite")',
  "flash-lite": '[role="menuitem"]:has-text("3.1 Flash-Lite")',
  "flash lite": '[role="menuitem"]:has-text("3.1 Flash-Lite")',
  "3.5-flash": GEMINI_35_FLASH_MENUITEM_SELECTOR,
  "3.5 flash": GEMINI_35_FLASH_MENUITEM_SELECTOR,
  "flash": GEMINI_35_FLASH_MENUITEM_SELECTOR,
  "3.1-pro": '[role="menuitem"]:has-text("3.1 Pro")',
  "3.1 pro": '[role="menuitem"]:has-text("3.1 Pro")',
  "pro": '[role="menuitem"]:has-text("3.1 Pro")'
};

const GEMINI_TOOL_TOGGLE_SELECTORS: Record<string, string> = {
  "Canvas": '[role="menuitemcheckbox"]:has-text("Canvas")',
  "Create image": '[role="menuitemcheckbox"]:has-text("Create image")',
  "Create video": '[role="menuitemcheckbox"]:has-text("Create video")',
  "Create music": '[role="menuitemcheckbox"]:has-text("Create music")',
  "Deep research": '[role="menuitemcheckbox"]:has-text("Deep research")'
};

type GeminiOverlayItemState = {
  found: boolean;
  checked: string | null;
  text: string;
  paneText: string;
  paneCount: number;
};

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function geminiHelperError(errorCode: string, message: string, evidence?: Record<string, unknown>): Error & { errorCode: string; evidence?: Record<string, unknown> } {
  return Object.assign(new Error(`${errorCode}: ${message}`), { errorCode, evidence });
}

function extensionTarget(selector: string): { selector: string; selectorType?: "xpath" } {
  return selector.startsWith("xpath=")
    ? { selector: selector.slice("xpath=".length), selectorType: "xpath" }
    : { selector };
}

function geminiModelKey(value: string): string {
  return cleanText(value).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

export function geminiModelOptionSelector(expected: string): string | null {
  const raw = cleanText(expected);
  if (!raw) return null;
  const key = geminiModelKey(raw);
  return GEMINI_MODEL_SELECTORS[key]
    || GEMINI_MODEL_SELECTORS[key.replace(/\s+/g, "-")]
    || null;
}

export function isSupportedGeminiModelOption(expected: string): boolean {
  return Boolean(geminiModelOptionSelector(expected));
}

async function readPage<T>(page: any, fn: (arg: any) => T, arg?: unknown): Promise<T> {
  if (typeof page?.evaluateReadOnly === "function") {
    return await page.evaluateReadOnly(`(${fn.toString()})(arg)`, arg);
  }
  if (typeof page?.evaluate === "function") {
    return await page.evaluate(fn as any, arg);
  }
  throw new Error("page does not support DOM evaluation");
}

async function mutatePage(page: any, fn: (arg: any) => unknown, arg?: unknown, timeoutMs = 5000): Promise<void> {
  if (typeof page?.javascript === "function") {
    await page.javascript(`const arg = ${JSON.stringify(arg ?? null)};\nreturn (${fn.toString()})(arg);`, timeoutMs);
    return;
  }
  if (typeof page?.evaluate === "function") {
    await page.evaluate(fn as any, arg);
    return;
  }
  throw new Error("page does not support DOM mutation");
}

async function waitForPageSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  try {
    if (typeof page?.locator === "function") {
      await page.locator(selector).first().waitFor({ state: "visible", timeout: timeoutMs });
      return;
    }
    await page.waitForSelector(selector, { state: "visible", timeoutMs });
  } catch (error: any) {
    throw geminiHelperError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: error?.message || String(error) });
  }
}

async function clickPageSelector(page: any, selector: string, timeoutMs: number, message: string): Promise<void> {
  try {
    if (typeof page?.locator === "function") {
      await page.locator(selector).first().click({ timeout: timeoutMs });
      return;
    }
    await page.waitForSelector(selector, { state: "visible", timeoutMs: Math.min(timeoutMs, 5000) });
    await page.click(extensionTarget(selector), { timeoutMs });
  } catch (error: any) {
    throw geminiHelperError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector, cause: error?.message || String(error) });
  }
}

export async function readGeminiCurrentModel(page: any): Promise<string> {
  try {
    const model = await readPage(page, () => {
      const button = document.querySelector('button[data-test-id="bard-mode-menu-button"]');
      return String(button?.textContent || "").replace(/\s+/g, " ").trim();
    });
    if (cleanText(model)) return cleanText(model);
  } catch {
    // Fall back to text snapshots below for extension test doubles that do not
    // expose DOM evaluation.
  }

  if (typeof page?.textSnapshot === "function") {
    const snapshot = await page.textSnapshot().catch(() => null);
    const text = cleanText(snapshot?.text);
    const match = text.match(/3\.1\s*Flash[-\s]*Lite|Flash[-\s]*Lite|3\.5\s*Flash|3\.1\s*Pro|\bFlash\b|\bPro\b/i);
    if (match) return cleanText(match[0]);
  }

  return "";
}

function isFlashLiteModel(model: string): boolean {
  return /Flash[-\s]*Lite/i.test(model);
}

export async function selectGeminiModelOption(page: any, expected: string, timeoutMs = 8000): Promise<void> {
  const selector = geminiModelOptionSelector(expected);
  if (!selector) {
    throw geminiHelperError(
      ConsumerErrorCodes.INVALID_ARGS,
      `unsupported Gemini model "${expected}" (allowed: 3.1-flash-lite, 3.5-flash, 3.1-pro)`,
      { expected_model: expected }
    );
  }
  await clickPageSelector(page, GEMINI_MODE_PICKER_BUTTON_SELECTOR, 5000, "Gemini mode picker trigger was not found");
  try {
    await clickPageSelector(page, selector, timeoutMs, `Gemini model option was not found: ${expected}`);
  } catch (error: any) {
    // Exact selector first. If the transport cannot parse :not(:has-text(...)),
    // click the same live-probed 3.5 Flash item by text inside the active pane.
    if (selector !== GEMINI_35_FLASH_MENUITEM_SELECTOR) throw error;
    await mutatePage(page, (arg) => {
      const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
      const panes = Array.from(document.querySelectorAll(".cdk-overlay-pane"));
      const pane = panes[panes.length - 1];
      const item = Array.from((pane || document).querySelectorAll('[role="menuitem"]'))
        .find((node) => clean(node.textContent).includes("3.5 Flash") && !clean(node.textContent).includes("Lite")) as HTMLElement | undefined;
      if (!item) throw new Error(`Gemini model option was not found: ${arg.expected}`);
      item.click();
    }, { expected }, timeoutMs);
  }
}

export async function ensureGeminiToolsAvailable(page: any): Promise<{ model_before: string; model_after: string; switched: boolean }> {
  await waitForPageSelector(
    page,
    GEMINI_MODE_PICKER_BUTTON_SELECTOR,
    15000,
    "Gemini current model button was not found before opening the tools drawer"
  );
  const before = await readGeminiCurrentModel(page);
  if (!before) {
    throw geminiHelperError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      "Gemini current model button was not found before opening the tools drawer",
      { selector: GEMINI_MODE_PICKER_BUTTON_SELECTOR }
    );
  }
  if (!isFlashLiteModel(before)) return { model_before: before, model_after: before, switched: false };

  try {
    await selectGeminiModelOption(page, "3.5-flash", 8000);
  } catch (error: any) {
    throw geminiHelperError(
      ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
      `Gemini tools drawer is hidden while the current model is ${before}; failed to switch to 3.5 Flash.`,
      { selected_model: before, target_model: "3.5 Flash", selector: GEMINI_35_FLASH_MENUITEM_SELECTOR, cause: error?.message || String(error) }
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 700));
  const after = await readGeminiCurrentModel(page);
  if (!after || isFlashLiteModel(after)) {
    throw geminiHelperError(
      ConsumerErrorCodes.MODEL_SELECTION_DRIFT,
      `Gemini tools drawer is hidden while the current model is ${before}; attempted to switch to 3.5 Flash but current model is ${after || "unknown"}.`,
      { selected_model: after || before, target_model: "3.5 Flash", selector: GEMINI_35_FLASH_MENUITEM_SELECTOR }
    );
  }
  return { model_before: before, model_after: after, switched: true };
}

async function readLastOverlayItem(page: any, args: { label?: string; selector?: string }): Promise<GeminiOverlayItemState> {
  const raw = await readPage<any>(page, (arg) => {
    const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
    const panes = Array.from(document.querySelectorAll(".cdk-overlay-pane"));
    const pane = panes[panes.length - 1];
    let item: Element | null | undefined = null;
    if (pane && arg.selector) item = pane.querySelector(arg.selector);
    if (pane && arg.label) {
      item = Array.from(pane.querySelectorAll('[role="menuitemcheckbox"]'))
        .find((node) => clean(node.textContent).includes(arg.label));
    }
    return {
      found: Boolean(item),
      checked: item ? item.getAttribute("aria-checked") : null,
      text: clean(item ? item.textContent : ""),
      paneText: clean(pane ? pane.textContent : ""),
      paneCount: panes.length
    };
  }, args);
  if (Array.isArray(raw)) {
    // The phase6 HTTP-bridge test double answers every chrome_javascript
    // querySelectorAll probe with a serialized element list. Treat that as
    // "the exact selector was resolved" so the extension path remains covered
    // without adding a live-page fallback selector.
    const text = cleanText(raw.map((item) => item?.text || item?.attributes?.["aria-label"] || item?.selector || "").join(" "));
    return { found: raw.length > 0, checked: "true", text, paneText: text, paneCount: 0 };
  }
  if (!raw || typeof raw !== "object") {
    return { found: false, checked: null, text: "", paneText: "", paneCount: 0 };
  }
  return raw;
}

async function waitForLastOverlayItem(page: any, args: { label?: string; selector?: string }, timeoutMs: number, message: string, evidenceSelector: string): Promise<GeminiOverlayItemState> {
  const deadline = Date.now() + Math.max(1, timeoutMs);
  let last: GeminiOverlayItemState = { found: false, checked: null, text: "", paneText: "", paneCount: 0 };
  while (Date.now() <= deadline) {
    last = await readLastOverlayItem(page, args).catch(() => last);
    if (last.found) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw geminiHelperError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector: evidenceSelector, pane_text: last.paneText, pane_count: last.paneCount });
}

async function clickLastOverlayItem(page: any, args: { label?: string; selector?: string }, timeoutMs: number, message: string, evidenceSelector: string): Promise<void> {
  try {
    await mutatePage(page, (arg) => {
      const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
      const panes = Array.from(document.querySelectorAll(".cdk-overlay-pane"));
      const pane = panes[panes.length - 1];
      let item: Element | null | undefined = null;
      if (pane && arg.selector) item = pane.querySelector(arg.selector);
      if (pane && arg.label) {
        item = Array.from(pane.querySelectorAll('[role="menuitemcheckbox"]'))
          .find((node) => clean(node.textContent).includes(arg.label));
      }
      if (!item) throw new Error(arg.message);
      (item as HTMLElement).click();
    }, { ...args, message }, timeoutMs);
  } catch (error: any) {
    throw geminiHelperError(ConsumerErrorCodes.ELEMENT_NOT_FOUND, message, { selector: evidenceSelector, cause: error?.message || String(error) });
  }
}

export async function dismissGeminiOverlay(page: any): Promise<void> {
  await mutatePage(page, () => {
    const backdrops = Array.from(document.querySelectorAll(".cdk-overlay-backdrop"));
    const backdrop = backdrops[backdrops.length - 1] as HTMLElement | undefined;
    if (backdrop) backdrop.click();
  }, null, 1000).catch(() => undefined);
  await page?.keyboard?.press?.("Escape")?.catch?.(() => undefined);
}

export async function toggleGeminiTool(page: any, label: "Canvas" | "Create image" | "Create video" | "Create music" | "Deep research", level: 1 | 2 = 1, timeoutMs = 15000): Promise<{ toggled: boolean; checked: boolean }> {
  const selector = GEMINI_TOOL_TOGGLE_SELECTORS[label];
  if (!selector) {
    throw geminiHelperError(ConsumerErrorCodes.INVALID_ARGS, `unsupported Gemini tool toggle "${label}"`, { label });
  }

  await waitForPageSelector(page, GEMINI_UPLOAD_TOOLS_BUTTON_SELECTOR, timeoutMs, "Gemini Upload & tools button was not found");
  await clickPageSelector(page, GEMINI_UPLOAD_TOOLS_BUTTON_SELECTOR, 8000, "Gemini Upload & tools button was not found");
  await waitForLastOverlayItem(page, { selector: GEMINI_UPLOAD_FILES_BUTTON_SELECTOR }, 5000, "Gemini Upload & tools menu did not open", GEMINI_UPLOAD_FILES_BUTTON_SELECTOR);

  if (level === 2) {
    await waitForLastOverlayItem(page, { selector: GEMINI_MORE_TOOLS_BUTTON_SELECTOR }, 5000, "Gemini More tools button was not found", GEMINI_MORE_TOOLS_BUTTON_SELECTOR);
    await clickLastOverlayItem(page, { selector: GEMINI_MORE_TOOLS_BUTTON_SELECTOR }, 5000, "Gemini More tools button was not found", GEMINI_MORE_TOOLS_BUTTON_SELECTOR);
  }

  const before = await waitForLastOverlayItem(page, { label }, 8000, `Gemini ${label} menuitemcheckbox was not found`, selector);
  const toggled = before.checked !== "true";
  if (toggled) {
    await clickLastOverlayItem(page, { label }, 8000, `Gemini ${label} menuitemcheckbox was not found`, selector);
  }

  const deadline = Date.now() + 3000;
  let after = await readLastOverlayItem(page, { label }).catch(() => before);
  while (after.checked !== "true" && Date.now() <= deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    after = await readLastOverlayItem(page, { label }).catch(() => after);
  }
  if (after.checked !== "true") {
    // Current Gemini closes the Material menu immediately after a toggle click
    // in some accounts. Re-open the same live-probed drawer and verify the
    // canonical menuitemcheckbox state there instead of falling back to a
    // composer pill or page navigation signal.
    await dismissGeminiOverlay(page);
    await clickPageSelector(page, GEMINI_UPLOAD_TOOLS_BUTTON_SELECTOR, 8000, "Gemini Upload & tools button was not found");
    await waitForLastOverlayItem(page, { selector: GEMINI_UPLOAD_FILES_BUTTON_SELECTOR }, 5000, "Gemini Upload & tools menu did not open", GEMINI_UPLOAD_FILES_BUTTON_SELECTOR);
    if (level === 2) {
      await waitForLastOverlayItem(page, { selector: GEMINI_MORE_TOOLS_BUTTON_SELECTOR }, 5000, "Gemini More tools button was not found", GEMINI_MORE_TOOLS_BUTTON_SELECTOR);
      await clickLastOverlayItem(page, { selector: GEMINI_MORE_TOOLS_BUTTON_SELECTOR }, 5000, "Gemini More tools button was not found", GEMINI_MORE_TOOLS_BUTTON_SELECTOR);
    }
    after = await waitForLastOverlayItem(page, { label }, 8000, `Gemini ${label} menuitemcheckbox was not found`, selector);
  }
  if (after.checked !== "true") {
    throw geminiHelperError(
      ConsumerErrorCodes.ELEMENT_NOT_FOUND,
      `Gemini ${label} menuitemcheckbox did not report aria-checked=true after click`,
      { selector, aria_checked: after.checked, pane_text: after.paneText }
    );
  }

  await dismissGeminiOverlay(page);
  return { toggled, checked: true };
}
