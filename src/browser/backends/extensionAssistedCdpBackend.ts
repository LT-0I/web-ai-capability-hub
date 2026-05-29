import { NativeMessagingClient, NativeMessagingClientOptions, NativeMessagingBridgeError } from "../../runtime/extension/nativeMessagingClient";
import { BridgeClient } from "../../runtime/extension/bridgeClient";
import { HttpBridgeClient, HttpBridgeClientOptions, classifyChromeExtensionBridgeError } from "../../runtime/extension/httpBridgeClient";
import { DESIGN_TAB_METHOD_TO_VENDOR_WIRE, DesignTabMethod, VENDOR_BROWSER_TOOL_NAMES } from "../../runtime/extension/protocol";
import { ConsumerErrorCodes } from "../../consumer/errorCodes";
import {
  BrowserAssetInfo,
  BrowserAssetsBundle,
  BrowserBackend,
  BrowserBackendPingResult,
  BrowserClaimTabOptions,
  BrowserClickOptions,
  BrowserElementSummary,
  BrowserElementTarget,
  BrowserFillOptions,
  BrowserNavigateOptions,
  BrowserNewTabOptions,
  BrowserPagePort,
  BrowserTabInfo,
  BrowserTextSnapshot,
  BrowserWaitForSelectorOptions
} from "./types";

export type ExtensionBridgeTransport = "stdio" | "http";

export interface ExtensionAssistedCdpBackendOptions extends NativeMessagingClientOptions, HttpBridgeClientOptions {
  client?: BridgeClient;
  transport?: ExtensionBridgeTransport;
}

export class BackendNotImplementedError extends Error {
  readonly backendKind = "extension-assisted-cdp";
  readonly tabMethod: DesignTabMethod;
  readonly wireMethod: string;

  constructor(tabMethod: DesignTabMethod, wireMethod: string) {
    super(`extensionAssistedCdpBackend.tab.${tabMethod} is deferred after Phase 4; a later phase should call vendor wire method ${wireMethod}.`);
    this.name = "BackendNotImplementedError";
    this.tabMethod = tabMethod;
    this.wireMethod = wireMethod;
  }
}

function parseToolPayload(value: unknown): any {
  if (!value || typeof value !== "object") return value;
  const content = (value as any).content;
  if (Array.isArray(content)) {
    const firstText = content.find((item) => item && item.type === "text" && typeof item.text === "string")?.text;
    if (firstText) {
      try { return JSON.parse(firstText); } catch { return { text: firstText }; }
    }
  }
  return value;
}

function bridgeErrorFromPayload(payload: unknown, fallback: string): NativeMessagingBridgeError {
  const errorCode = classifyChromeExtensionBridgeError(payload);
  const message = typeof payload === "object" && payload && typeof (payload as any).message === "string"
    ? (payload as any).message
    : typeof payload === "object" && payload && typeof (payload as any).text === "string"
      ? (payload as any).text
      : fallback;
  return new NativeMessagingBridgeError(errorCode, message, payload);
}

function assertVendorSuccess(payload: any, wireMethod: string): void {
  if (payload?.success === false || payload?.error || payload?.isError) {
    throw bridgeErrorFromPayload(payload?.error || payload, `Chrome extension vendor tool ${wireMethod} failed`);
  }
}

function isTransientBridgeDisconnect(error: any): boolean {
  const text = `${error?.message || ""}\n${JSON.stringify(error?.details || error?.payload || error?.data || "")}`;
  return /message channel closed|Receiving end does not exist|Extension context invalidated|context invalidated|port closed/i.test(text);
}

/**
 * Detects the class of bridge errors raised when an in-flight navigation/redirect
 * destroys the page's JavaScript execution context mid-evaluation. ChatGPT's
 * newTab → CHATGPT_FRESH_URL client-redirect can tear down the context while an
 * in-page waitForSelector poll loop is running, which the vendor surfaces with a
 * CDP-class message ("Execution context was destroyed", "Cannot find context with
 * specified id", "Inspected target navigated or closed", "Target closed", etc.).
 * This is distinct from isTransientBridgeDisconnect (port/channel teardown): the
 * native-messaging port stays up, only the per-frame JS context is gone, so
 * re-issuing chrome_javascript re-acquires a fresh context.
 */
function isExecutionContextDestroyed(error: any): boolean {
  const text = `${error?.message || ""}\n${JSON.stringify(error?.details || error?.payload || error?.data || "")}`;
  return /execution context was destroyed|context was destroyed|cannot find context(?: with specified id)?|no (?:execution )?context (?:with|found)|inspected target (?:navigated|closed)|target (?:closed|crashed)|frame (?:was )?detached|execution context is not available|(?:execution context|frame|target|node|document) (?:no longer exists|no longer available)|navigating and changing the document/i.test(text);
}

function isSafeVendorRetry(method: string): boolean {
  return method === VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT
    || method === VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER
    || method === VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS
    || method === VENDOR_BROWSER_TOOL_NAMES.SWITCH_TAB;
}

function normalizeTab(raw: any): BrowserTabInfo | undefined {
  if (!raw) return undefined;
  const tabId = raw.tabId ?? raw.id;
  if (tabId === undefined && !raw.url) return undefined;
  return {
    id: String(tabId ?? raw.url),
    kind: "extension-assisted-cdp",
    tabId,
    windowId: typeof raw.windowId === "number" ? raw.windowId : undefined,
    url: raw.url || "about:blank",
    title: raw.title,
    active: raw.active,
    raw
  };
}

function flattenWindowTabs(payload: any): BrowserTabInfo[] {
  const tabs: BrowserTabInfo[] = [];
  for (const win of payload?.windows || []) {
    for (const tab of win.tabs || []) {
      const normalized = normalizeTab({ ...tab, windowId: win.windowId ?? tab.windowId });
      if (normalized) tabs.push(normalized);
    }
  }
  return tabs;
}

function pickTabFromNavigatePayload(payload: any): BrowserTabInfo | undefined {
  if (Array.isArray(payload?.tabs) && payload.tabs.length > 0) return normalizeTab({ ...payload.tabs[0], windowId: payload.windowId });
  return normalizeTab(payload);
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function withTabScope(base: Record<string, unknown>, tabId?: string | number, windowId?: number): Record<string, unknown> {
  const tab = numberOrUndefined(tabId);
  return {
    ...base,
    ...(tab === undefined ? {} : { tabId: tab }),
    ...(windowId === undefined ? {} : { windowId })
  };
}

function parseJavaScriptResult(payload: any, wireMethod = VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT): any {
  assertVendorSuccess(payload, wireMethod);
  const result = payload?.result !== undefined ? payload.result : payload;
  if (typeof result === "string") {
    try { return JSON.parse(result); } catch { return result; }
  }
  return result;
}

function normalizeElementSummary(value: any, index: number): BrowserElementSummary {
  const attributes = value?.attributes && typeof value.attributes === "object" ? value.attributes : {};
  return {
    index: Number.isFinite(value?.index) ? Number(value.index) : index,
    tagName: String(value?.tagName || "").toLowerCase(),
    text: String(value?.text || ""),
    selector: typeof value?.selector === "string" ? value.selector : undefined,
    attributes
  };
}

function normalizeAssetType(value: unknown, initiatorType?: string): BrowserAssetInfo["type"] {
  const raw = String(value || initiatorType || "").toLowerCase();
  if (/script/.test(raw)) return "script";
  if (/css|style/.test(raw)) return "stylesheet";
  if (/img|image|picture/.test(raw)) return "image";
  if (/font/.test(raw)) return "font";
  if (/fetch|xmlhttprequest|beacon/.test(raw)) return "fetch";
  return "other";
}

function normalizeAssetInfo(value: any): BrowserAssetInfo | null {
  const url = typeof value?.url === "string" ? value.url : typeof value?.name === "string" ? value.name : "";
  if (!url) return null;
  const initiatorType = typeof value?.initiatorType === "string" ? value.initiatorType : undefined;
  return { url, type: normalizeAssetType(value?.type, initiatorType), initiatorType };
}

function escapeReadOnlyArg(arg: unknown): string {
  return JSON.stringify(arg === undefined ? null : arg);
}

/**
 * Best-effort read-only enforcement: this rejects common textual write patterns
 * before dispatching to chrome_javascript. It is not a JavaScript parser and must
 * not be treated as a security sandbox; callers should pass observation-only
 * expressions and use mutating BrowserPagePort methods for writes/actions.
 */
const READ_ONLY_DENY_PATTERNS: RegExp[] = [
  /\.(?:value|innerHTML|outerHTML|textContent)\s*=/i,
  /\b(?:appendChild|removeChild|replaceChild|insertBefore|insertAdjacentHTML|replaceChildren|setAttribute|removeAttribute)\s*\(/i,
  /\bclassList\.(?:add|remove|toggle|replace)\s*\(/i,
  /\b(?:click|focus|blur|submit|dispatchEvent)\s*\(/i,
  /\b(?:localStorage|sessionStorage)\.setItem\s*\(/i,
  /\bdocument\.cookie\s*=/i,
  /\+\+|--/
];

function assertReadOnlyExpression(expression: string): void {
  for (const pattern of READ_ONLY_DENY_PATTERNS) {
    if (pattern.test(expression)) {
      throw new NativeMessagingBridgeError(
        ConsumerErrorCodes.CHROME_EXTENSION_PERMISSION_DENIED,
        `evaluateReadOnly rejected a mutating JavaScript expression matching ${pattern}`,
        { pattern: String(pattern) }
      );
    }
  }
}

function selectorLiteral(selector: string): string {
  return JSON.stringify(selector);
}

const SELECTOR_HELPER_SCRIPT = `
const __parseSelector = (raw) => {
  const m = raw.match(/^(.*?):has-text\\(\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^)]*))\\s*\\)\\s*$/);
  if (!m) return { base: raw, text: null };
  const base = (m[1] || '').trim() || '*';
  const text = (m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : (m[4] || '').trim().replace(/^["']|["']$/g, ''));
  return { base, text };
};
const __qsa = (raw) => {
  const { base, text } = __parseSelector(raw);
  const all = Array.from(document.querySelectorAll(base));
  if (text === null) return all;
  const needle = text.toLowerCase();
  return all.filter((el) => ((el.innerText || el.textContent || '').toLowerCase().includes(needle)));
};
const __qs = (raw) => __qsa(raw)[0] || null;
`;

function waitForSelectorScript(selector: string, options: BrowserWaitForSelectorOptions = {}): string {
  const state = options.state || "attached";
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs || 30_000));
  return `
const selector = ${selectorLiteral(selector)};
const state = ${JSON.stringify(state)};
const timeoutMs = ${timeoutMs};
${SELECTOR_HELPER_SCRIPT}
const isVisible = (el) => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
};
const matches = () => {
  const el = __qs(selector);
  if (state === 'attached') return !!el;
  if (state === 'detached') return !el;
  if (state === 'visible') return isVisible(el);
  if (state === 'hidden') return !el || !isVisible(el);
  return !!el;
};
const deadline = Date.now() + timeoutMs;
while (Date.now() <= deadline) {
  if (matches()) return { success: true, selector, state };
  await new Promise((resolve) => setTimeout(resolve, 100));
}
throw new Error('waitForSelector timeout for ' + selector + ' state=' + state);
`;
}

function queryElementsScript(selector: string, limit: number): string {
  return `
const selector = ${selectorLiteral(selector)};
const limit = ${Math.max(0, Math.floor(limit))};
${SELECTOR_HELPER_SCRIPT}
const cssPath = (el) => {
  if (!(el instanceof Element)) return undefined;
  if (el.id) return '#' + CSS.escape(el.id);
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    let part = node.localName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.localName === node.localName);
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
};
const serializeElement = (el, index) => ({
  index,
  tagName: el.tagName.toLowerCase(),
  text: (el.innerText || el.textContent || '').trim().slice(0, 1000),
  selector: cssPath(el),
  attributes: Object.fromEntries(Array.from(el.attributes || []).map((attr) => [attr.name, attr.value]))
});
return __qsa(selector).slice(0, limit).map(serializeElement);
`;
}

function assetsListScript(bundle = false): string {
  const listExpression = `
const classify = (url, initiatorType, tagName) => {
  const raw = String(initiatorType || tagName || '').toLowerCase();
  if (/script/.test(raw)) return 'script';
  if (/css|style/.test(raw)) return 'stylesheet';
  if (/img|image|picture/.test(raw) || /\\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(url)) return 'image';
  if (/font/.test(raw) || /\\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(url)) return 'font';
  if (/fetch|xmlhttprequest|beacon/.test(raw)) return 'fetch';
  return 'other';
};
const seen = new Map();
const add = (url, initiatorType, tagName) => {
  if (!url || typeof url !== 'string') return;
  const absolute = new URL(url, document.baseURI).href;
  if (!seen.has(absolute)) seen.set(absolute, { url: absolute, type: classify(absolute, initiatorType, tagName), initiatorType: initiatorType || tagName || undefined });
};
performance.getEntriesByType('resource').forEach((entry) => add(entry.name, entry.initiatorType));
document.querySelectorAll('img,video,audio,source,picture > source').forEach((el) => {
  add(el.currentSrc || el.src || el.href || el.getAttribute('src') || el.getAttribute('srcset')?.split(',')[0]?.trim()?.split(/\\s+/)[0], undefined, el.tagName);
});
const assets = Array.from(seen.values());`;
  return bundle ? `${listExpression}\nreturn { assets, capturedAt: new Date().toISOString() };` : `${listExpression}\nreturn assets;`;
}

export class ExtensionAssistedPagePort implements BrowserPagePort {
  readonly kind = "extension-assisted-cdp" as const;
  readonly tabId?: string | number;
  private readonly windowId?: number;
  private readonly client?: BridgeClient;

  constructor(client: BridgeClient, tabId?: string | number, windowId?: number);
  constructor(tabId?: string | number, windowId?: number);
  constructor(clientOrTabId?: BridgeClient | string | number, tabIdOrWindowId?: string | number, windowId?: number) {
    if (clientOrTabId && typeof clientOrTabId === "object" && typeof (clientOrTabId as BridgeClient).request === "function") {
      this.client = clientOrTabId as BridgeClient;
      this.tabId = tabIdOrWindowId;
      this.windowId = windowId;
    } else {
      this.tabId = clientOrTabId as string | number | undefined;
      this.windowId = typeof tabIdOrWindowId === "number" ? tabIdOrWindowId : undefined;
    }
  }

  async getInfo(): Promise<BrowserTabInfo> { return this.notImplemented("getInfo"); }

  async navigate(url: string, options: BrowserNavigateOptions = {}): Promise<BrowserTabInfo> {
    const payload = await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, withTabScope({ url }, this.tabId, this.windowId), options.timeoutMs);
    const tab = pickTabFromNavigatePayload(payload) || normalizeTab({ tabId: this.tabId, windowId: this.windowId, url });
    if (!tab) throw bridgeErrorFromPayload(payload, "chrome_navigate did not return tab information");
    return tab;
  }

  async waitForSelector(selector: string, options: BrowserWaitForSelectorOptions = {}): Promise<void> {
    // Use nullish defaulting so an explicit timeoutMs:0 keeps a zero (already-elapsed)
    // budget instead of being widened to the 30s default. Only an undefined/missing
    // timeout defaults to 30_000. No Math.max(1, ...) floor — that would re-introduce
    // a 1ms budget for an explicit 0 and dispatch the in-page JS once.
    const totalTimeoutMs = Math.max(0, Math.floor(options.timeoutMs ?? 30_000));
    const deadline = Date.now() + totalTimeoutMs;
    let lastContextError: any;
    // Bounded retry: an in-flight navigation/redirect (e.g. ChatGPT's newTab →
    // CHATGPT_FRESH_URL client-redirect) can destroy the JS execution context
    // mid-wait. When that happens AND time remains in the caller's budget,
    // re-acquire the context and retry the poll with the REMAINING time instead
    // of fast-rejecting to ELEMENT_NOT_FOUND. A genuinely missing selector still
    // throws the in-page "waitForSelector timeout" (not a context-destroyed
    // error) after the full budget elapses, preserving the honest not-found path.
    for (;;) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        if (lastContextError) throw lastContextError;
        throw new Error(`waitForSelector timeout for ${selector} state=${options.state || "attached"}`);
      }
      try {
        const payload = await this.javascript(
          waitForSelectorScript(selector, { ...options, timeoutMs: remainingMs }),
          remainingMs
        );
        assertVendorSuccess(payload, VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT);
        return;
      } catch (error: any) {
        // Only swallow-and-retry execution-context destruction while budget remains.
        // All other errors (including the in-page timeout = genuine not-found) propagate.
        if (isExecutionContextDestroyed(error) && Date.now() < deadline) {
          lastContextError = error;
          // Brief settle so the redirect can land before we re-acquire the context,
          // but never sleep past the caller's deadline (clamp to remaining budget).
          const settleMs = Math.min(50, Math.max(0, deadline - Date.now()));
          if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
          continue;
        }
        throw error;
      }
    }
  }

  async queryElements(selector: string, options: { limit?: number } = {}): Promise<BrowserElementSummary[]> {
    const limit = Math.max(0, Math.min(500, Math.floor(options.limit || 50)));
    const result = parseJavaScriptResult(await this.javascript(queryElementsScript(selector, limit)));
    return (Array.isArray(result) ? result : []).slice(0, limit).map(normalizeElementSummary);
  }

  async elementState(..._args: any[]): Promise<any> { return this.notImplemented("elementState"); }
  async elementBox(..._args: any[]): Promise<any> { return this.notImplemented("elementBox"); }

  async click(target: BrowserElementTarget, options: BrowserClickOptions = {}): Promise<void> {
    const resolved = await this.resolveTextSelector(target);
    await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.CLICK, withTabScope({
      ...resolved,
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      waitForNavigation: options.waitForNavigation,
      button: options.button,
      double: options.double,
      modifiers: options.modifiers
    }, this.tabId, this.windowId), options.timeoutMs);
  }

  async fill(target: BrowserElementTarget, value: string | number | boolean, options: BrowserFillOptions = {}): Promise<void> {
    const resolved = await this.resolveTextSelector(target);
    try {
      await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.FILL, withTabScope({
        ...resolved,
        value
      }, this.tabId, this.windowId), options.timeoutMs);
      return;
    } catch (error: any) {
      const message = error?.message || String(error);
      if (!/not a fillable element|must be INPUT|TEXTAREA|SELECT/i.test(message)) throw error;
      const selector = (resolved as any)?.selector;
      if (typeof selector !== "string" || !selector) throw error;
      // contenteditable div fallback: vendor FILL rejects non-INPUT/TEXTAREA/SELECT,
      // but Claude/Gemini composers are contenteditable. Mirror gemini-music execCommand insertText path.
      await this.javascript(`
const value = ${JSON.stringify(String(value))};
const el = document.querySelector(${JSON.stringify(selector)});
if (!el) throw new Error("contenteditable fill: element not found");
el.focus();
const sel = window.getSelection && window.getSelection();
if (sel) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
let inserted = false;
try { inserted = document.execCommand && document.execCommand("insertText", false, value); } catch (_) { inserted = false; }
if (!inserted) el.textContent = value;
el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
el.dispatchEvent(new Event("change", { bubbles: true }));
return { filled: true, textLength: (el.textContent || "").length };
`, options.timeoutMs);
    }
  }

  async uploadFile(selector: string, filePath: string, options: { timeoutMs?: number; multiple?: boolean } = {}): Promise<void> {
    await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.FILE_UPLOAD, withTabScope({
      selector,
      filePath,
      multiple: options.multiple === true
    }, this.tabId, this.windowId), options.timeoutMs);
  }

  private async resolveTextSelector(target: BrowserElementTarget): Promise<BrowserElementTarget> {
    const selector = (target as any)?.selector;
    if (typeof selector !== "string" || !/:has-text\(/i.test(selector)) return target;
    const matches = await this.queryElements(selector, { limit: 1 });
    const resolvedSelector = matches[0]?.selector;
    if (typeof resolvedSelector !== "string" || resolvedSelector.length === 0) return target;
    return { ...target, selector: resolvedSelector } as BrowserElementTarget;
  }

  async press(..._args: any[]): Promise<void> { return this.notImplemented("press"); }

  async evaluateReadOnly<T = unknown>(expression: string, arg?: unknown): Promise<T> {
    assertReadOnlyExpression(expression);
    const code = `const arg = ${escapeReadOnlyArg(arg)};\nreturn await (async (arg) => (${expression}))(arg);`;
    return parseJavaScriptResult(await this.javascript(code)) as T;
  }

  async textSnapshot(options: { selector?: string } = {}): Promise<BrowserTextSnapshot> {
    const payload = await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER, withTabScope({
      textContent: true,
      htmlContent: false,
      ...(options.selector ? { selector: options.selector } : {})
    }, this.tabId, this.windowId));
    return {
      url: String(payload?.url || ""),
      title: typeof payload?.title === "string" ? payload.title : undefined,
      text: String(payload?.textContent ?? payload?.text ?? "")
    };
  }

  async assetsList(): Promise<BrowserAssetInfo[]> {
    const result = parseJavaScriptResult(await this.javascript(assetsListScript(false)));
    return (Array.isArray(result) ? result : []).map(normalizeAssetInfo).filter(Boolean) as BrowserAssetInfo[];
  }

  async assetsBundle(): Promise<BrowserAssetsBundle> {
    const result = parseJavaScriptResult(await this.javascript(assetsListScript(true)));
    const assets = (Array.isArray(result?.assets) ? result.assets : []).map(normalizeAssetInfo).filter(Boolean) as BrowserAssetInfo[];
    const capturedAt = typeof result?.capturedAt === "string" ? result.capturedAt : new Date().toISOString();
    return { assets, capturedAt };
  }

  async close(): Promise<void> {
    const tab = numberOrUndefined(this.tabId);
    await this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.CLOSE_TABS, tab === undefined ? {} : { tabIds: [tab] });
  }

  private async javascript(code: string, timeoutMs?: number): Promise<any> {
    return this.vendorRequest(VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT, withTabScope({
      code,
      ...(timeoutMs === undefined ? {} : { timeoutMs })
    }, this.tabId, this.windowId), timeoutMs);
  }

  private async vendorRequest(method: DesignTabMethod extends never ? never : string, params: Record<string, unknown>, timeoutMs?: number): Promise<any> {
    const client = this.requireClient();
    const requestOptions = timeoutMs === undefined ? undefined : { timeoutMs };
    let done = false;
    const keepAlive = setInterval(() => {
      if (done) return;
      client.ping({ timeoutMs: 3000 }).catch(() => undefined);
    }, 10_000);
    let response: unknown;
    try {
      try {
        response = await client.request(method as any, params, requestOptions);
      } catch (error) {
        if (!isSafeVendorRetry(method) || !isTransientBridgeDisconnect(error)) throw error;
        await client.connect?.({ heartbeat: false }).catch(() => undefined);
        response = await client.request(method as any, params, requestOptions);
      }
    } finally {
      done = true;
      clearInterval(keepAlive);
    }
    const payload = parseToolPayload(response);
    assertVendorSuccess(payload, method);
    return payload;
  }

  private requireClient(): BridgeClient {
    if (!this.client) {
      throw new NativeMessagingBridgeError(
        ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED,
        "Extension-assisted page port has no bridge client",
        { tabId: this.tabId }
      );
    }
    return this.client;
  }

  private notImplemented(method: DesignTabMethod): never {
    const wireMethod = DESIGN_TAB_METHOD_TO_VENDOR_WIRE[method];
    throw new BackendNotImplementedError(method, wireMethod);
  }

  getWindowId(): number | undefined { return this.windowId; }
}

export class ExtensionAssistedCdpBackend implements BrowserBackend {
  readonly kind = "extension-assisted-cdp" as const;
  private readonly client: BridgeClient;

  constructor(options: ExtensionAssistedCdpBackendOptions = {}) {
    this.client = options.client || (options.transport === "http" || options.httpBridgeUrl || options.baseUrl
      ? new HttpBridgeClient(options)
      : new NativeMessagingClient(options));
  }

  async ping(): Promise<BrowserBackendPingResult> {
    if (this.client.connect) await this.client.connect();
    else await this.client.ping();
    return { ok: true, kind: this.kind, connected: true };
  }

  async listTabs(): Promise<BrowserTabInfo[]> {
    if (this.client.connect) await this.client.connect({ heartbeat: false });
    const response = await this.client.request(VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS, {});
    const payload = parseToolPayload(response);
    assertVendorSuccess(payload, VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS);
    return flattenWindowTabs(payload);
  }

  async claimTab(options: BrowserClaimTabOptions = {}): Promise<BrowserPagePort> {
    if (this.client.connect) await this.client.connect({ heartbeat: false });
    let tabId = options.tabId;
    let windowId = options.windowId;

    if (tabId === undefined) {
      const tabs = await this.listTabs();
      const target = options.url
        ? tabs.find((tab) => tab.url === options.url || tab.url.startsWith(options.url || "") || tab.url.includes(options.url || ""))
        : tabs.find((tab) => tab.active) || tabs[0];
      if (!target) throw new Error("No extension-assisted browser tab is available to claim");
      tabId = target.tabId;
      windowId = target.windowId;
    }

    if (tabId === undefined) throw new Error("tabId is required to claim an extension-assisted browser tab");
    const response = await this.client.request(VENDOR_BROWSER_TOOL_NAMES.SWITCH_TAB, {
      tabId: typeof tabId === "string" ? Number(tabId) : tabId,
      ...(windowId === undefined ? {} : { windowId })
    });
    const payload = parseToolPayload(response);
    assertVendorSuccess(payload, VENDOR_BROWSER_TOOL_NAMES.SWITCH_TAB);
    const tab = normalizeTab({ tabId, windowId, ...payload });
    return new ExtensionAssistedPagePort(this.client, tab?.tabId ?? tabId, tab?.windowId ?? windowId);
  }

  async newTab(options: BrowserNewTabOptions = {}): Promise<BrowserPagePort> {
    if (this.client.connect) await this.client.connect({ heartbeat: false });
    const response = await this.client.request(VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, {
      url: options.url || "about:blank",
      newWindow: options.newWindow,
      windowId: options.windowId,
      width: options.width,
      height: options.height,
      background: options.background
    });
    const payload = parseToolPayload(response);
    assertVendorSuccess(payload, VENDOR_BROWSER_TOOL_NAMES.NAVIGATE);
    const tab = pickTabFromNavigatePayload(payload);
    return new ExtensionAssistedPagePort(this.client, tab?.tabId, tab?.windowId ?? options.windowId);
  }

  async finalize(): Promise<void> {
    await this.client.dispose();
  }
}

export function createExtensionAssistedCdpBackend(options: ExtensionAssistedCdpBackendOptions = {}): ExtensionAssistedCdpBackend {
  return new ExtensionAssistedCdpBackend(options);
}
