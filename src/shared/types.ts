export type ElementRole =
  | "button"
  | "link"
  | "textbox"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "tab"
  | "menu"
  | "menuitem"
  | "form"
  | "table"
  | "list"
  | "iframe"
  | "download"
  | "other";

export interface SnapshotElement {
  ref: string;
  role: ElementRole | string;
  name: string;
  text?: string;
  selector?: string;
  tagName?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  visible?: boolean;
  attributes?: Record<string, string>;
  selectorCandidates?: string[];
}

export interface SnapshotForm {
  ref: string;
  name?: string;
  selector?: string;
  method?: string;
  action?: string;
  fields: SnapshotElement[];
}

export interface SnapshotTable {
  ref: string;
  caption?: string;
  selector?: string;
  headers: string[];
  rows: string[][];
}

export interface SnapshotList {
  ref: string;
  selector?: string;
  ordered: boolean;
  items: string[];
}

export interface SnapshotIframe {
  ref: string;
  title?: string;
  src?: string;
  selector?: string;
  accessible: boolean;
  summary?: string;
}

export interface AccessibilitySummaryNode {
  role: string;
  name?: string;
  value?: string;
  checked?: boolean | string;
  level?: number;
  ref?: string;
  children?: AccessibilitySummaryNode[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: string;
  visibleText: string;
  elements: SnapshotElement[];
  forms: SnapshotForm[];
  tables: SnapshotTable[];
  lists: SnapshotList[];
  iframes: SnapshotIframe[];
  accessibility?: AccessibilitySummaryNode[];
  screenshotPath?: string;
  warnings: string[];
}

export type HealthCheckResult = "ok" | "missing" | "ambiguous" | "blocked" | "needs_review";

export interface HealthCheckReportItem {
  name: string;
  category: string;
  status_before: string;
  result: HealthCheckResult;
  selectors_checked: string[];
}

export interface HealthCheckReport {
  target_id: string;
  checked_at: string;
  total: number;
  ok: number;
  missing: number;
  ambiguous: number;
  blocked: number;
  needs_review: number;
  items: HealthCheckReportItem[];
}

export interface SemanticTarget {
  selector?: string;
  role?: string;
  name?: string;
  text?: string;
  placeholder?: string;
  label?: string;
  ref?: string;
  index?: number;
}

export type BrowserActionType =
  | "open"
  | "click"
  | "type"
  | "press"
  | "select"
  | "hover"
  | "select-text"
  | "drag"
  | "upload"
  | "wait"
  | "scroll"
  | "extract"
  | "download"
  | "screenshot";

export interface BrowserAction {
  type: BrowserActionType;
  url?: string;
  selector?: string;
  target?: SemanticTarget;
  text?: string;
  key?: string;
  option?: string;
  start?: number;
  end?: number;
  from?: [number, number];
  to?: [number, number];
  fromOffset?: [number, number];
  toOffset?: [number, number];
  steps?: number;
  holdMs?: number;
  /** Pointer dwell duration for hover-intent menus; when set, hover uses raw CDP mouseMoved events. */
  dwellMs?: number;
  /** Optional selector that must appear after a hover-dwell interaction. */
  settleSelector?: string;
  /** Local file paths used by upload actions. */
  files?: string[];
  waitFor?: "text" | "selector" | "navigation" | "download" | "timeout";
  timeoutMs?: number;
  state?: "visible" | "hidden" | "attached" | "detached";
  direction?: "up" | "down";
  amount?: number;
  extract?: "table" | "list" | "text" | "snapshot";
  dryRun?: boolean;
  confirmed?: boolean;
  riskyReason?: string;
  expectDownload?: boolean;
  until?: "visible" | "enabled" | "stable" | "download" | "contentRegex";
  untilSelector?: string;
  untilContentRegex?: string;
  untilStableMs?: number;
  untilTimeoutMs?: number;
}

export interface ActionResult {
  ok: boolean;
  action: BrowserAction;
  message: string;
  dryRun?: boolean;
  data?: unknown;
  downloadPath?: string;
  screenshotPath?: string;
}

export interface ApprovalGate {
  stepId: string;
  action: string;
  reason: string;
}

export interface WorkflowApprovalResponse {
  ok: false;
  status: "approval_required";
  approvalGates: ApprovalGate[];
  plan?: object;
}

export interface DownloadRecord {
  id: string;
  profile?: string;
  tabId?: string;
  url?: string;
  suggestedFilename: string;
  savedPath: string;
  sizeBytes?: number;
  mimeType?: string;
  createdAt?: string;
  sourceUrl?: string;
  timestamp: string;
  failure?: string | null;
  artifactId?: string;
}

export interface ArtifactRecord {
  id: string;
  target_id: string;
  capture_id: string | null;
  kind: "download" | "screenshot" | "export" | string;
  path: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface SiteMap {
  site: string;
  capturedAt: string;
  url: string;
  title: string;
  elements: SnapshotElement[];
  forms: SnapshotForm[];
  tables: SnapshotTable[];
  lists: SnapshotList[];
  notes?: string;
}

export interface SiteMapDiff {
  site: string;
  previousCapturedAt?: string;
  currentCapturedAt?: string;
  addedElements: SnapshotElement[];
  removedElements: SnapshotElement[];
  changedElements: Array<{ before: SnapshotElement; after: SnapshotElement; changes: string[] }>;
  addedForms: SnapshotForm[];
  removedForms: SnapshotForm[];
  summary: string;
}
