import { BrowserAction } from "../shared/types";

export type WorkflowMode = "assisted" | "manual-approval" | "dry-run" | "automatic";

export interface WorkflowResultSpec {
  type: "screenshot" | "download" | "text" | "snapshot" | "none";
}

export interface WorkflowFinalResult {
  kind: string;
  path?: string;
  text?: string;
  data?: any;
  sourceStepId?: string;
}

export interface WorkflowStepDefinition {
  id?: string;
  use_capability?: string;
  action?: BrowserAction["type"] | "observe" | "read" | "clear_draft";
  capability?: string;
  input?: Record<string, unknown>;
  target?: Record<string, unknown>;
  selector?: string;
  text?: string;
  files?: string[];
  waitFor?: BrowserAction["waitFor"];
  timeoutMs?: number;
  confirmed?: boolean;
  riskyReason?: string;
  until?: BrowserAction["until"];
  untilSelector?: string;
  untilContentRegex?: string;
  untilStableMs?: number;
  untilTimeoutMs?: number;
}

export interface WorkflowDefinition {
  id: string;
  target: string;
  profile?: string;
  mode?: WorkflowMode;
  description?: string;
  result?: WorkflowResultSpec;
  steps: WorkflowStepDefinition[];
}

export interface CompiledWorkflowAction {
  stepId: string;
  capability?: string;
  action: BrowserAction;
  requiresApproval: boolean;
  reason?: string;
  resolvedSelectors?: string[];
}

export interface WorkflowActionPlan {
  id: string;
  target: string;
  profile?: string;
  mode?: WorkflowMode;
  compiledAt: string;
  actions: CompiledWorkflowAction[];
  warnings: string[];
  result?: WorkflowResultSpec;
}

export interface WorkflowRunResult {
  ok: boolean;
  dryRun?: boolean;
  plan: WorkflowActionPlan;
  results: Array<{ stepId: string; ok: boolean; message: string; data?: unknown; downloadPath?: string; screenshotPath?: string }>;
  finalResult?: WorkflowFinalResult;
}
