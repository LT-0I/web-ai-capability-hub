import { BrowserAction } from "../shared/types";

export type WorkflowMode = "assisted" | "manual-approval" | "dry-run" | "automatic";

export interface WorkflowResultSpec {
  type: "screenshot" | "download" | "text" | "text/html" | "snapshot" | "none";
}

export interface WorkflowFinalResult {
  kind: string;
  path?: string;
  text?: string;
  data?: any;
  sourceStepId?: string;
}

export interface WorkflowGateSpec {
  /** All entries must hold for the gate to pass. */
  json_path?: Array<{ path: string; equals?: unknown; nonempty?: boolean; regex?: string }>;
  /** Expected exit code from the spawned process. */
  exit_code?: number;
  /** Regex evaluated against captured stdout. */
  stdout_regex?: string;
}

export interface WorkflowStepDefinition {
  id?: string;
  use_capability?: string;
  action?: BrowserAction["type"] | "artifactClick" | "verifyDocxMin" | "observe" | "read" | "clear_draft" | "command";
  args?: Record<string, unknown>;
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
  idempotent?: boolean;
  /** argv to spawn as a child process; presence triggers the command step type. */
  command?: string[];
  /** Extra env vars merged onto process.env when running command. */
  command_env?: Record<string, string>;
  /** Gate spec evaluated against command stdout/exit_code. */
  gate?: WorkflowGateSpec;
}

export interface WorkflowDefinition {
  id: string;
  target: string;
  profile?: string;
  mode?: WorkflowMode;
  description?: string;
  result?: WorkflowResultSpec;
  inputs?: Record<string, { type?: string; required?: boolean; default?: unknown }>;
  outputs?: Record<string, unknown>;
  steps: WorkflowStepDefinition[];
}

export interface CompiledWorkflowAction {
  stepId: string;
  capability?: string;
  action: BrowserAction;
  requiresApproval: boolean;
  reason?: string;
  resolvedSelectors?: string[];
  idempotent?: boolean;
  /** Optional command-step payload; when present, executor spawns a child process instead of a browser action. */
  command?: { argv: string[]; env?: Record<string, string>; timeoutMs?: number; gate?: WorkflowGateSpec };
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
  runId?: string;
}
