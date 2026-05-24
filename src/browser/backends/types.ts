export type BrowserBackendKind = "managed-cdp" | "extension-assisted-cdp";

export interface BrowserBackendPingResult {
  ok: boolean;
  kind: BrowserBackendKind;
  connected: boolean;
  message?: string;
}

export interface BrowserTabInfo {
  id: string;
  kind: BrowserBackendKind;
  tabId?: string | number;
  pageId?: string;
  windowId?: number;
  profile?: string;
  url: string;
  title?: string;
  active?: boolean;
  raw?: unknown;
}

export interface BrowserClaimTabOptions {
  tabId?: string | number;
  pageId?: string;
  windowId?: number;
  url?: string;
  profile?: string;
  runId?: string;
}

export interface BrowserNewTabOptions {
  url?: string;
  tabId?: string;
  windowId?: number;
  profile?: string;
  runId?: string;
  background?: boolean;
  newWindow?: boolean;
  width?: number;
  height?: number;
}

export interface BrowserNavigateOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeoutMs?: number;
}

export interface BrowserWaitForSelectorOptions {
  timeoutMs?: number;
  state?: "attached" | "detached" | "visible" | "hidden";
}

export interface BrowserElementTarget {
  selector?: string;
  selectorType?: "css" | "xpath";
  ref?: string;
  frameId?: number;
  coordinates?: { x: number; y: number };
}

export interface BrowserClickOptions {
  waitForNavigation?: boolean;
  timeoutMs?: number;
  button?: "left" | "right" | "middle";
  double?: boolean;
  modifiers?: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
}

export interface BrowserFillOptions {
  timeoutMs?: number;
}

export interface BrowserPressOptions {
  selector?: string;
  delayMs?: number;
}

export interface BrowserElementSummary {
  index: number;
  tagName: string;
  text: string;
  selector?: string;
  attributes: Record<string, string>;
}

export interface BrowserElementState {
  exists: boolean;
  visible: boolean;
  disabled?: boolean;
  checked?: boolean;
  value?: unknown;
  text?: string;
}

export interface BrowserBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTextSnapshot {
  url: string;
  title?: string;
  text: string;
}

export interface BrowserAssetInfo {
  url: string;
  type: "script" | "stylesheet" | "image" | "font" | "fetch" | "other";
  initiatorType?: string;
}

export interface BrowserAssetsBundle {
  assets: BrowserAssetInfo[];
  capturedAt: string;
}

export interface BrowserPagePort {
  readonly kind: BrowserBackendKind;
  readonly tabId?: string | number;
  getInfo(): Promise<BrowserTabInfo>;
  navigate(url: string, options?: BrowserNavigateOptions): Promise<BrowserTabInfo>;
  waitForSelector(selector: string, options?: BrowserWaitForSelectorOptions): Promise<void>;
  queryElements(selector: string, options?: { limit?: number }): Promise<BrowserElementSummary[]>;
  elementState(target: BrowserElementTarget): Promise<BrowserElementState>;
  elementBox(target: BrowserElementTarget): Promise<BrowserBox | null>;
  click(target: BrowserElementTarget, options?: BrowserClickOptions): Promise<void>;
  fill(target: BrowserElementTarget, value: string | number | boolean, options?: BrowserFillOptions): Promise<void>;
  press(key: string, options?: BrowserPressOptions): Promise<void>;
  evaluateReadOnly<T = unknown>(expression: string, arg?: unknown): Promise<T>;
  textSnapshot(options?: { selector?: string }): Promise<BrowserTextSnapshot>;
  assetsList(): Promise<BrowserAssetInfo[]>;
  assetsBundle(): Promise<BrowserAssetsBundle>;
  close(): Promise<void>;
}

export interface BrowserBackend {
  readonly kind: BrowserBackendKind;
  ping(): Promise<BrowserBackendPingResult>;
  listTabs(options?: { profile?: string }): Promise<BrowserTabInfo[]>;
  claimTab(options?: BrowserClaimTabOptions): Promise<BrowserPagePort>;
  newTab(options?: BrowserNewTabOptions): Promise<BrowserPagePort>;
  finalize(): Promise<void>;
}
