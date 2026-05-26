const crypto = require("node:crypto");
const child_process = require("node:child_process");
import { ActionExecutor } from "../actions/executor";
import { runArtifactClick, ArtifactClickOptions } from "../browser/artifactClick";
import { acquireProfileLease, releaseProfileLease } from "../browser/profileLease";
import { BrowserProfileStore } from "../browser/profileStore";
import { CapabilityDatabase } from "../capabilities/database";
import { redactValue, RedactionOptions } from "../trace/redact";
import { verifyDocxMin } from "../verifiers/docxMin";
import { WorkflowCompiler } from "./compiler";
import { CompiledWorkflowAction, WorkflowActionPlan, WorkflowDefinition, WorkflowFinalResult, WorkflowGateSpec, WorkflowRunResult } from "./schema";
import { ActionResult } from "../shared/types";

function now(): string { return new Date().toISOString(); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
function hashInputs(value: unknown): string { return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function redaction(options: WorkflowExecutorOptions): RedactionOptions { return options.redaction || { mode: "default" }; }
function inputsHash(item: CompiledWorkflowAction): string { return hashInputs({ action: item.action, capability: item.capability, stepId: item.stepId }); }

export interface WorkflowExecutorOptions {
  dryRun?: boolean;
  database?: CapabilityDatabase;
  actionExecutor?: ActionExecutor;
  runId?: string;
  resumeRunId?: string;
  confirmReplay?: boolean;
  inputs?: Record<string, unknown>;
  redaction?: RedactionOptions;
}

export class WorkflowResumeError extends Error {
  constructor(readonly errorCode: "RESUME_REQUIRES_CONFIRMATION" | "IDEMPOTENCY_MISMATCH", message: string, readonly evidence: Record<string, unknown> = {}) { super(message); }
}

export class WorkflowExecutor {
  private database: CapabilityDatabase;
  private compiler: WorkflowCompiler;

  constructor(private options: WorkflowExecutorOptions = {}) {
    this.database = options.database || new CapabilityDatabase();
    this.compiler = new WorkflowCompiler(this.database);
  }

  async runFile(filePath: string, options: WorkflowExecutorOptions = {}): Promise<WorkflowRunResult> {
    const workflow = this.compiler.load(filePath);
    return this.run(workflow, options);
  }

  async run(workflow: WorkflowDefinition, options: WorkflowExecutorOptions = {}): Promise<WorkflowRunResult> {
    const plan = this.compiler.compile(workflow);
    return this.runPlan(plan, { ...this.options, ...options });
  }

  async runPlan(plan: WorkflowActionPlan, options: WorkflowExecutorOptions = {}): Promise<WorkflowRunResult> {
    const resolvedOptions = { ...this.options, ...options };
    if (resolvedOptions.resumeRunId) return this.resumePlan(plan, resolvedOptions.resumeRunId, resolvedOptions);
    const dryRun = resolvedOptions.dryRun === true;
    const runId = resolvedOptions.runId || CapabilityDatabase.id("run");
    const startedAt = now();
    this.database.addWorkflowRun({ id: runId, workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: dryRun ? "dry-run" : plan.mode, status: dryRun ? "dry-run" : "running", started_at: startedAt, plan: plan as any });
    if (dryRun) {
      const results = plan.actions.map((item) => ({ stepId: item.stepId, ok: true, message: `Dry run: ${item.action.type}${item.requiresApproval ? ` (approval required: ${item.reason})` : ""}`, data: item.action }));
      this.database.addWorkflowRun({ id: runId, workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: "dry-run", status: "completed", started_at: startedAt, finished_at: now(), plan: plan as any, result: { results } });
      return { ok: true, dryRun: true, plan, results, runId };
    }
    this.acquireLeaseIfNeeded(plan, runId);
    const results: WorkflowRunResult["results"] = [];
    let finalResult: WorkflowFinalResult | undefined;
    let thrown: unknown;
    try {
      const context = executionContext(plan, resolvedOptions.inputs);
      for (const item of plan.actions) {
        const result = await this.runOneStep(runId, item, resolvedOptions, context);
        results.push(result);
        rememberStepResult(context, result);
      }
      finalResult = this.computeFinalResult(plan, results);
      return { ok: results.every((result) => result.ok), plan, results, finalResult, runId };
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      const status = thrown ? terminalFailureStatus(thrown) : results.every((result) => result.ok) ? "succeeded" : "failed";
      this.database.addWorkflowRun({ id: runId, workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: plan.mode, status, started_at: startedAt, finished_at: now(), plan: plan as any, result: { results, finalResult, ...(thrown ? { error: workflowErrorResult(thrown) } : {}) } });
      if (plan.profile) releaseProfileLease(plan.profile, { database: this.database });
    }
  }

  async resumeRun(runId: string, options: WorkflowExecutorOptions = {}): Promise<WorkflowRunResult> {
    const run = this.database.getWorkflowRun(runId);
    if (!run?.plan) throw new Error(`workflow:run --resume could not find stored plan for run ${runId}`);
    return this.resumePlan(run.plan as any, runId, { ...this.options, ...options, resumeRunId: runId });
  }

  private async resumePlan(plan: WorkflowActionPlan, runId: string, options: WorkflowExecutorOptions): Promise<WorkflowRunResult> {
    const succeeded = new Map<string, any>();
    for (const event of this.database.listRunEvents(runId)) if ((event.status || event.event_type) === "succeeded" && event.step_id) succeeded.set(event.step_id, event);
    const priorSucceeded = plan.actions.filter((action) => succeeded.has(action.stepId));
    const nonIdempotent = priorSucceeded.filter((action) => !action.idempotent);
    if (nonIdempotent.length && !options.confirmReplay) throw new WorkflowResumeError("RESUME_REQUIRES_CONFIRMATION", "Resume crosses previously successful non-idempotent step(s); pass --confirm-replay to acknowledge replay/cost risk.", { runId, stepIds: nonIdempotent.map((step) => step.stepId) });
    for (const action of priorSucceeded) {
      const event = succeeded.get(action.stepId);
      const expected = inputsHash(action);
      if (event.inputs_hash && event.inputs_hash !== expected) throw new WorkflowResumeError("IDEMPOTENCY_MISMATCH", "Stored step inputs hash does not match the compiled workflow action.", { runId, stepId: action.stepId, expected, actual: event.inputs_hash });
    }
    let startIndex = -1;
    for (let index = 0; index < plan.actions.length; index++) if (succeeded.has(plan.actions[index].stepId)) startIndex = index;
    this.acquireLeaseIfNeeded(plan, runId);
    const startedAt = this.database.getWorkflowRun(runId)?.started_at || now();
    const results: WorkflowRunResult["results"] = [];
    let finalResult: WorkflowFinalResult | undefined;
    let thrown: unknown;
    try {
      const context = executionContext(plan, options.inputs);
      for (let index = 0; index < plan.actions.length; index++) {
        const item = plan.actions[index];
        const prior = succeeded.get(item.stepId);
        if (index <= startIndex && prior) {
          const result = prior.payload?.result || {};
          const row = { stepId: item.stepId, ok: true, message: item.idempotent ? "Resume: reused successful idempotent step." : "Resume: acknowledged previous non-idempotent success.", data: result.data, downloadPath: result.downloadPath, screenshotPath: result.screenshotPath };
          results.push(row);
          rememberStepResult(context, row);
          continue;
        }
        const result = await this.runOneStep(runId, item, options, context);
        results.push(result);
        rememberStepResult(context, result);
      }
      finalResult = this.computeFinalResult(plan, results);
      return { ok: results.every((result) => result.ok), plan, results, finalResult, runId };
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      const status = thrown ? terminalFailureStatus(thrown) : results.every((result) => result.ok) ? "succeeded" : "failed";
      this.database.addWorkflowRun({ id: runId, workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: plan.mode, status, started_at: startedAt, finished_at: now(), plan: plan as any, result: { results, finalResult, resumed: true, ...(thrown ? { error: workflowErrorResult(thrown) } : {}) } });
      if (plan.profile) releaseProfileLease(plan.profile, { database: this.database });
    }
  }

  private async runOneStep(runId: string, item: CompiledWorkflowAction, options: WorkflowExecutorOptions, context: WorkflowExecutionContext): Promise<WorkflowRunResult["results"][number]> {
    const startedAt = now();
    const hash = inputsHash(item);
    this.database.addRunEvent({ id: CapabilityDatabase.id("event"), run_id: runId, step_id: item.stepId, event_type: "started", status: "started", timestamp: startedAt, started_at: startedAt, inputs_hash: hash, idempotency_key: item.idempotent ? `${runId}:${item.stepId}:${hash}` : undefined, payload: redactValue({ action: item.action, approvalRequired: item.requiresApproval, idempotent: item.idempotent }, redaction(options)) as any });
    try {
      const result = await this.executeAction(item, options, context);
      const row = { stepId: item.stepId, ok: result.ok, message: result.message, data: result.data, downloadPath: result.downloadPath, screenshotPath: result.screenshotPath };
      this.database.addRunEvent({ id: CapabilityDatabase.id("event"), run_id: runId, step_id: item.stepId, event_type: result.ok ? "succeeded" : "failed", status: result.ok ? "succeeded" : "failed", timestamp: now(), started_at: startedAt, finished_at: now(), inputs_hash: hash, output_artifact_ids: outputArtifactIds(result), error_code: result.ok ? undefined : (result.data as any)?.errorCode, evidence: redactValue(result.data ?? {}, redaction(options)) as any, payload: redactValue({ result }, redaction(options)) as any });
      if (!result.ok && isCustomWorkflowAction(item.action.type)) {
        const error: any = workflowActionError((result.data as any)?.errorCode || "WORKFLOW_ACTION_FAILED", result.message, result.data as Record<string, unknown>);
        error.alreadyRecorded = true;
        throw error;
      }
      return row;
    } catch (error) {
      if ((error as any)?.alreadyRecorded) throw error;
      const errorCode = (error as any)?.errorCode;
      const evidence = redactValue((error as any)?.evidence || {}, redaction(options)) as Record<string, unknown>;
      this.database.addRunEvent({ id: CapabilityDatabase.id("event"), run_id: runId, step_id: item.stepId, event_type: "failed", status: "failed", timestamp: now(), started_at: startedAt, finished_at: now(), inputs_hash: hash, error_code: errorCode, evidence, payload: redactValue({ error: error instanceof Error ? error.message : String(error), errorCode, evidence }, redaction(options)) as any });
      throw error;
    }
  }


  private async executeAction(item: CompiledWorkflowAction, options: WorkflowExecutorOptions, context: WorkflowExecutionContext): Promise<ActionResult> {
    if (item.command) {
      if (item.requiresApproval) {
        return { ok: false, action: item.action, message: item.reason || "command step requires approval", data: { errorCode: "APPROVAL_REQUIRED", reason: item.reason } };
      }
      const resolvedArgv = (resolveTemplates(item.command.argv, context) as unknown[]).map((value) => String(value));
      const resolvedEnv = item.command.env ? (resolveTemplates(item.command.env, context) as Record<string, string>) : undefined;
      return await runCommandStep(item, resolvedArgv, resolvedEnv, item.command.gate, item.command.timeoutMs);
    }
    const action = resolveTemplates(item.action, context) as any;
    if (action.type === "artifactClick") {
      const result = await runArtifactClick(actionOptions(action) as unknown as ArtifactClickOptions);
      return { ok: true, action, message: "Artifact captured", data: result, downloadPath: result.path };
    }
    if (action.type === "verifyDocxMin") {
      const args = actionOptions(action) as Record<string, unknown>;
      const docxPath = String(args.path || "");
      const topicRegex = typeof args.topicRegex === "string" && args.topicRegex ? new RegExp(args.topicRegex) : args.topicRegex instanceof RegExp ? args.topicRegex : undefined;
      const result = verifyDocxMin(docxPath, {
        minParagraphs: Number(args.minParagraphs),
        minChars: Number(args.minChars),
        topicRegex,
        recordSha256: args.recordSha256 === false ? false : true
      });
      return { ok: result.ok, action, message: result.ok ? "DOCX verification passed" : "DOCX verification failed", data: result.ok ? result : { ...result, errorCode: "DOCX_VERIFICATION_FAILED" } };
    }
    if (!options.actionExecutor) throw new Error("Workflow execution requires an ActionExecutor for non-custom actions unless dryRun is true.");
    return options.actionExecutor.execute(action);
  }

  private acquireLeaseIfNeeded(plan: WorkflowActionPlan, runId: string): void {
    if (!plan.profile) return;
    const store = new BrowserProfileStore();
    const record = store.get(plan.profile);
    acquireProfileLease({ profileId: plan.profile, runId, ownerPid: process.pid, chromeProcessPid: record.processId, userDataDir: record.profileDir, database: this.database });
  }

  private computeFinalResult(plan: WorkflowActionPlan, results: WorkflowRunResult["results"]): WorkflowFinalResult | undefined {
    const spec = plan.result;
    if (!spec) return undefined;
    if (spec.type === "none") return { kind: "none" };

    const lastMatching = (predicate: (action: WorkflowActionPlan["actions"][number], result: WorkflowRunResult["results"][number]) => boolean) => {
      for (let index = plan.actions.length - 1; index >= 0; index--) {
        const action = plan.actions[index];
        const result = results[index];
        if (action && result && predicate(action, result)) return { action, result };
      }
      return undefined;
    };

    if (spec.type === "screenshot") {
      const match = lastMatching((action, result) => action.action.type === "screenshot" && !!(result.screenshotPath || pathFromData(result.data)));
      return match ? { kind: "screenshot", path: match.result.screenshotPath || pathFromData(match.result.data), sourceStepId: match.result.stepId } : { kind: "screenshot" };
    }
    if (spec.type === "download") {
      const match = lastMatching((action, result) => action.action.type === "download" && !!(result.downloadPath || pathFromData(result.data)));
      return match ? { kind: "download", path: match.result.downloadPath || pathFromData(match.result.data), sourceStepId: match.result.stepId } : { kind: "download" };
    }
    if (spec.type === "text") {
      const match = lastMatching((action) => action.action.type === "extract" && (action.action.extract || "snapshot") === "text");
      if (!match) return { kind: "text" };
      const text = typeof match.result.data === "string" ? match.result.data : match.result.data === undefined ? undefined : JSON.stringify(match.result.data);
      return { kind: "text", text, sourceStepId: match.result.stepId };
    }
    if (spec.type === "text/html") {
      const match = lastMatching((_action, result) => htmlStringFromData(result.data) !== undefined);
      if (!match) return { kind: "text/html" };
      const text = htmlStringFromData(match.result.data);
      return { kind: "text/html", text, data: text, sourceStepId: match.result.stepId };
    }
    if (spec.type === "snapshot") {
      const match = lastMatching((action) => action.action.type === "extract" && (action.action.extract || "snapshot") === "snapshot");
      return match ? { kind: "snapshot", data: match.result.data, sourceStepId: match.result.stepId } : { kind: "snapshot" };
    }
    return undefined;
  }
}

function terminalFailureStatus(error: unknown): "failed" | "aborted" {
  const anyError = error as any;
  const code = String(anyError?.errorCode || anyError?.code || anyError?.name || "").toUpperCase();
  return code === "ABORTED" || code === "CANCELLED" || code === "CANCELED" || code === "ABORTERROR" ? "aborted" : "failed";
}

function workflowErrorResult(error: unknown): Record<string, unknown> {
  const anyError = error as any;
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(anyError?.errorCode ? { errorCode: anyError.errorCode } : {}),
    ...(anyError?.evidence ? { evidence: anyError.evidence } : {})
  };
}

function outputArtifactIds(result: any): string[] {
  const ids = new Set<string>();
  const data = result?.data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.artifactId === "string") ids.add(record.artifactId);
    if (Array.isArray(record.artifactIds)) for (const item of record.artifactIds) if (typeof item === "string") ids.add(item);
  }
  return [...ids];
}

function pathFromData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.path === "string") return record.path;
  if (typeof record.savedPath === "string") return record.savedPath;
  if (typeof record.screenshotPath === "string") return record.screenshotPath;
  if (typeof record.downloadPath === "string") return record.downloadPath;
  return undefined;
}

function htmlStringFromData(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  for (const key of ["html", "text_html", "textHtml", "content", "stdout"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

interface WorkflowExecutionContext { inputs: Record<string, unknown>; steps: Record<string, any>; }

function executionContext(plan: WorkflowActionPlan, inputs: Record<string, unknown> = {}): WorkflowExecutionContext {
  return { inputs: { ...planInputDefaults((plan as any).definition), ...inputs }, steps: {} };
}

function planInputDefaults(definition: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const specs = definition?.inputs && typeof definition.inputs === "object" ? definition.inputs : {};
  for (const [key, spec] of Object.entries(specs)) {
    if (spec && typeof spec === "object" && "default" in (spec as any)) out[key] = (spec as any).default;
  }
  return out;
}

function rememberStepResult(context: WorkflowExecutionContext, result: WorkflowRunResult["results"][number]): void {
  context.steps[result.stepId] = { ...((result.data && typeof result.data === "object") ? result.data as Record<string, unknown> : {}), outputs: result.data, data: result.data, path: pathFromData(result.data), downloadPath: result.downloadPath, screenshotPath: result.screenshotPath };
}

function resolveTemplates(value: unknown, context: WorkflowExecutionContext): unknown {
  if (typeof value === "string") return resolveTemplateString(value, context);
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, context)]));
  return value;
}

function resolveTemplateString(value: string, context: WorkflowExecutionContext): unknown {
  const exact = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(value);
  if (exact) {
    const resolved = lookupTemplate(exact[1].trim(), context);
    return resolved === undefined ? value : resolved;
  }
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr) => {
    const resolved = lookupTemplate(String(expr).trim(), context);
    return resolved === undefined ? _match : String(resolved);
  });
}

function lookupTemplate(expr: string, context: WorkflowExecutionContext): unknown {
  const parts = expr.split(".").filter(Boolean);
  let cursor: any = parts[0] === "inputs" ? context.inputs : parts[0] === "steps" ? context.steps : undefined;
  for (const part of parts.slice(1)) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function actionOptions(action: any): Record<string, unknown> {
  const raw = action.args && typeof action.args === "object" ? action.args : action.target && typeof action.target === "object" ? action.target : {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "command") continue;
    out[kebabToCamel(key)] = value;
  }
  return out;
}

function kebabToCamel(key: string): string { return key.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()); }
function isCustomWorkflowAction(type: string): boolean { return type === "artifactClick" || type === "verifyDocxMin"; }

const COMMAND_STEP_DEFAULT_TIMEOUT_MS = 300000;

async function runCommandStep(item: CompiledWorkflowAction, argv: string[], env: Record<string, string> | undefined, gate: WorkflowGateSpec | undefined, timeoutMs?: number): Promise<ActionResult> {
  if (!argv.length) return { ok: false, action: item.action, message: "command step requires non-empty argv", data: { errorCode: "INVALID_COMMAND" } };
  const startedAt = Date.now();
  const limit = Math.max(1, Math.min(timeoutMs || COMMAND_STEP_DEFAULT_TIMEOUT_MS, 24 * 3600 * 1000));
  const result = await new Promise<{ code: number; signal: string | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    const child: any = child_process.spawn(argv[0], argv.slice(1), { env: { ...process.env, ...(env || {}) }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer: any = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* noop */ }
      const killTimer: any = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* noop */ } }, 5000);
      if (typeof killTimer.unref === "function") killTimer.unref();
    }, limit);
    (child.stdout as any)?.on("data", (chunk: any) => { stdout += String(chunk); });
    (child.stderr as any)?.on("data", (chunk: any) => { stderr += String(chunk); });
    child.on("close", (code: number | null, signal: string | null) => {
      clearTimeout(timer);
      resolve({ code: code === null ? 1 : code, signal, stdout, stderr, timedOut });
    });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false });
    });
  });
  const parsedStdout = parseStdoutJson(result.stdout, result.stderr);
  const gateResult = evaluateCommandGate(gate, { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, parsed: parsedStdout, timedOut: result.timedOut });
  const elapsedMs = Date.now() - startedAt;
  const data: Record<string, unknown> = {
    argv,
    exit_code: result.code,
    signal: result.signal,
    timed_out: result.timedOut,
    elapsed_ms: elapsedMs,
    stdout: result.stdout,
    stderr: result.stderr,
    stdout_parsed: parsedStdout,
    gate: gateResult.detail
  };
  // Hoist parsed JSON keys (e.g. response_text, completion_detected) so closure-runner /
  // workflow consumers can pick them up via shallow `valuesByKey` walks without
  // having to descend into stdout_parsed explicitly.
  if (parsedStdout && typeof parsedStdout === "object" && !Array.isArray(parsedStdout)) {
    for (const [k, v] of Object.entries(parsedStdout)) {
      if (k === "ok" || k === "argv" || k === "exit_code" || k === "signal" || k === "timed_out" || k === "elapsed_ms" || k === "stdout" || k === "stderr" || k === "stdout_parsed" || k === "gate") continue;
      data[k] = v;
    }
  }
  if (!gateResult.ok) data.errorCode = result.timedOut ? "COMMAND_TIMEOUT" : (parsedStdout && (parsedStdout as any).errorCode) || "COMMAND_GATE_FAILED";
  return { ok: gateResult.ok, action: item.action, message: gateResult.message, data };
}

function parseStdoutJson(stdout: string, stderr: string): unknown {
  const candidates = [stdout, stderr, `${stdout}\n${stderr}`].map((s) => String(s || "").trim()).filter(Boolean);
  for (const text of candidates) { try { return JSON.parse(text); } catch { /* try next */ } }
  for (const text of candidates) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch { /* try previous */ } }
  }
  for (const text of candidates) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch { /* fallthrough */ } }
  }
  return undefined;
}

function evaluateCommandGate(gate: WorkflowGateSpec | undefined, ctx: { exitCode: number; stdout: string; stderr: string; parsed: unknown; timedOut: boolean }): { ok: boolean; message: string; detail: Record<string, unknown> } {
  const detail: Record<string, unknown> = {};
  if (ctx.timedOut) return { ok: false, message: "command timed out", detail: { timed_out: true } };
  if (!gate) {
    const ok = ctx.exitCode === 0;
    return { ok, message: ok ? "command completed (no gate; exit 0)" : `command exited ${ctx.exitCode} (no gate)`, detail: { default_exit_zero: true, exit_code: ctx.exitCode } };
  }
  const failures: string[] = [];
  if (gate.exit_code !== undefined) {
    const ok = ctx.exitCode === gate.exit_code;
    detail.exit_code = { expected: gate.exit_code, actual: ctx.exitCode, ok };
    if (!ok) failures.push(`exit_code ${ctx.exitCode} !== ${gate.exit_code}`);
  }
  if (gate.stdout_regex) {
    let ok = false;
    let regexError: string | undefined;
    try { ok = compileWorkflowRegex(gate.stdout_regex).test(ctx.stdout); } catch (error) { regexError = error instanceof Error ? error.message : String(error); }
    detail.stdout_regex = { pattern: gate.stdout_regex, ok, regexError };
    if (!ok) failures.push(`stdout_regex /${gate.stdout_regex}/ failed${regexError ? `: ${regexError}` : ""}`);
  }
  if (Array.isArray(gate.json_path) && gate.json_path.length > 0) {
    const checks: Array<Record<string, unknown>> = [];
    for (const check of gate.json_path) {
      const actual = lookupJsonPath(ctx.parsed, check.path);
      let ok = true;
      const reasons: string[] = [];
      if (check.equals !== undefined && !jsonEquals(actual, check.equals)) { ok = false; reasons.push(`!== ${JSON.stringify(check.equals)}`); }
      if (check.nonempty === true && !jsonNonEmpty(actual)) { ok = false; reasons.push("empty"); }
      if (check.regex) {
        let matched = false;
        let regexError: string | undefined;
        try { matched = compileWorkflowRegex(check.regex).test(typeof actual === "string" ? actual : JSON.stringify(actual ?? "")); } catch (error) { regexError = error instanceof Error ? error.message : String(error); }
        if (!matched) { ok = false; reasons.push(`regex /${check.regex}/ failed${regexError ? `: ${regexError}` : ""}`); }
      }
      checks.push({ path: check.path, actual, ok, reasons: reasons.length ? reasons : undefined });
      if (!ok) failures.push(`json_path ${check.path} ${reasons.join("; ")}`);
    }
    detail.json_path = checks;
  }
  const ok = failures.length === 0;
  return { ok, message: ok ? "command gate passed" : `command gate failed: ${failures.join("; ")}`, detail };
}

function compileWorkflowRegex(pattern: string): RegExp {
  const inlineFlags = /^\(\?([imsu]+)\)([\s\S]*)$/.exec(pattern);
  if (!inlineFlags) return new RegExp(pattern);
  const flags = Array.from(new Set(inlineFlags[1].split(""))).join("");
  return new RegExp(inlineFlags[2], flags);
}

function lookupJsonPath(value: unknown, expr: string): unknown {
  if (value === undefined || value === null) return undefined;
  let cursor: any = value;
  const parts = expr.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  for (const part of parts) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function jsonNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return !!value;
}
function workflowActionError(errorCode: string, message: string, evidence: Record<string, unknown> = {}): Error {
  const error: any = new Error(message);
  error.errorCode = errorCode;
  error.evidence = evidence;
  return error;
}
