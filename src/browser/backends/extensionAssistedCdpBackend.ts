import { NativeMessagingClient, NativeMessagingClientOptions } from "../../runtime/extension/nativeMessagingClient";
import { DESIGN_TAB_METHOD_TO_VENDOR_WIRE, DesignTabMethod, VENDOR_BROWSER_TOOL_NAMES } from "../../runtime/extension/protocol";
import {
  BrowserBackend,
  BrowserBackendPingResult,
  BrowserClaimTabOptions,
  BrowserNewTabOptions,
  BrowserPagePort,
  BrowserTabInfo
} from "./types";

export interface ExtensionAssistedCdpBackendOptions extends NativeMessagingClientOptions {
  client?: NativeMessagingClient;
}

export class BackendNotImplementedError extends Error {
  readonly backendKind = "extension-assisted-cdp";
  readonly tabMethod: DesignTabMethod;
  readonly wireMethod: string;

  constructor(tabMethod: DesignTabMethod, wireMethod: string) {
    super(`extensionAssistedCdpBackend.tab.${tabMethod} is not implemented in Phase 3; Phase 4 should call vendor wire method ${wireMethod}.`);
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

export class ExtensionAssistedPagePort implements BrowserPagePort {
  readonly kind = "extension-assisted-cdp" as const;

  constructor(readonly tabId?: string | number, private readonly windowId?: number) {}

  async getInfo(): Promise<BrowserTabInfo> { return this.notImplemented("getInfo"); }
  async navigate(..._args: any[]): Promise<BrowserTabInfo> { return this.notImplemented("navigate"); }
  async waitForSelector(..._args: any[]): Promise<void> { return this.notImplemented("waitForSelector"); }
  async queryElements(..._args: any[]): Promise<any[]> { return this.notImplemented("queryElements"); }
  async elementState(..._args: any[]): Promise<any> { return this.notImplemented("elementState"); }
  async elementBox(..._args: any[]): Promise<any> { return this.notImplemented("elementBox"); }
  async click(..._args: any[]): Promise<void> { return this.notImplemented("click"); }
  async fill(..._args: any[]): Promise<void> { return this.notImplemented("fill"); }
  async press(..._args: any[]): Promise<void> { return this.notImplemented("press"); }
  async evaluateReadOnly<T = unknown>(..._args: any[]): Promise<T> { return this.notImplemented("evaluateReadOnly"); }
  async textSnapshot(..._args: any[]): Promise<any> { return this.notImplemented("textSnapshot"); }
  async assetsList(..._args: any[]): Promise<any[]> { return this.notImplemented("assetsList"); }
  async assetsBundle(..._args: any[]): Promise<any> { return this.notImplemented("assetsBundle"); }
  async close(..._args: any[]): Promise<void> { return this.notImplemented("close"); }

  private notImplemented(method: DesignTabMethod): never {
    const wireMethod = DESIGN_TAB_METHOD_TO_VENDOR_WIRE[method];
    throw new BackendNotImplementedError(method, wireMethod);
  }

  getWindowId(): number | undefined { return this.windowId; }
}

export class ExtensionAssistedCdpBackend implements BrowserBackend {
  readonly kind = "extension-assisted-cdp" as const;
  private readonly client: NativeMessagingClient;

  constructor(options: ExtensionAssistedCdpBackendOptions = {}) {
    this.client = options.client || new NativeMessagingClient(options);
  }

  async ping(): Promise<BrowserBackendPingResult> {
    await this.client.connect();
    return { ok: true, kind: this.kind, connected: true };
  }

  async listTabs(): Promise<BrowserTabInfo[]> {
    await this.client.connect({ heartbeat: false });
    const response = await this.client.request(VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS, {});
    const payload = parseToolPayload(response);
    return flattenWindowTabs(payload);
  }

  async claimTab(options: BrowserClaimTabOptions = {}): Promise<BrowserPagePort> {
    await this.client.connect({ heartbeat: false });
    let tabId = options.tabId;
    let windowId = options.windowId;

    if (tabId === undefined) {
      const tabs = await this.listTabs();
      const target = options.url
        ? tabs.find((tab) => tab.url === options.url || tab.url.startsWith(options.url || ""))
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
    const tab = normalizeTab({ tabId, windowId, ...payload });
    return new ExtensionAssistedPagePort(tab?.tabId ?? tabId, tab?.windowId ?? windowId);
  }

  async newTab(options: BrowserNewTabOptions = {}): Promise<BrowserPagePort> {
    await this.client.connect({ heartbeat: false });
    const response = await this.client.request(VENDOR_BROWSER_TOOL_NAMES.NAVIGATE, {
      url: options.url || "about:blank",
      newWindow: options.newWindow,
      windowId: options.windowId,
      width: options.width,
      height: options.height,
      background: options.background
    });
    const payload = parseToolPayload(response);
    const tab = pickTabFromNavigatePayload(payload);
    return new ExtensionAssistedPagePort(tab?.tabId, tab?.windowId ?? options.windowId);
  }

  async finalize(): Promise<void> {
    await this.client.dispose();
  }
}

export function createExtensionAssistedCdpBackend(options: ExtensionAssistedCdpBackendOptions = {}): ExtensionAssistedCdpBackend {
  return new ExtensionAssistedCdpBackend(options);
}
