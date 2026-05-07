import { ActionExecutor } from "../actions/executor";
import { CapabilityDatabase } from "../capabilities/database";
import { WorkflowCompiler } from "./compiler";
import { WorkflowActionPlan, WorkflowDefinition, WorkflowFinalResult, WorkflowRunResult } from "./schema";

function now(): string { return new Date().toISOString(); }

export interface WorkflowExecutorOptions {
  dryRun?: boolean;
  database?: CapabilityDatabase;
  actionExecutor?: ActionExecutor;
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
    const dryRun = resolvedOptions.dryRun === true;
    const runId = CapabilityDatabase.id("run");
    this.database.addWorkflowRun({ id: runId, workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: dryRun ? "dry-run" : plan.mode, status: dryRun ? "dry-run" : "running", started_at: now(), plan: plan as any });
    if (dryRun) {
      const results = plan.actions.map((item) => ({ stepId: item.stepId, ok: true, message: `Dry run: ${item.action.type}${item.requiresApproval ? ` (approval required: ${item.reason})` : ""}`, data: item.action }));
      this.database.addWorkflowRun({ id: CapabilityDatabase.id("run"), workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: "dry-run", status: "completed", started_at: now(), finished_at: now(), result: { results } });
      return { ok: true, dryRun: true, plan, results };
    }
    if (!resolvedOptions.actionExecutor) throw new Error("Workflow execution requires an ActionExecutor unless dryRun is true.");
    const results: WorkflowRunResult["results"] = [];
    for (const item of plan.actions) {
      this.database.addRunEvent({ id: CapabilityDatabase.id("event"), run_id: runId, step_id: item.stepId, event_type: "before_action", timestamp: now(), payload: { action: item.action, approvalRequired: item.requiresApproval } });
      const result = await resolvedOptions.actionExecutor.execute(item.action);
      results.push({ stepId: item.stepId, ok: result.ok, message: result.message, data: result.data, downloadPath: result.downloadPath, screenshotPath: result.screenshotPath });
      this.database.addRunEvent({ id: CapabilityDatabase.id("event"), run_id: runId, step_id: item.stepId, event_type: "after_action", timestamp: now(), payload: { result } });
    }
    const finalResult = this.computeFinalResult(plan, results);
    this.database.addWorkflowRun({ id: CapabilityDatabase.id("run"), workflow_id: plan.id, target_id: plan.target, profile: plan.profile, mode: plan.mode, status: "completed", started_at: now(), finished_at: now(), result: { results, finalResult } });
    return { ok: results.every((result) => result.ok), plan, results, finalResult };
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
    if (spec.type === "snapshot") {
      const match = lastMatching((action) => action.action.type === "extract" && (action.action.extract || "snapshot") === "snapshot");
      return match ? { kind: "snapshot", data: match.result.data, sourceStepId: match.result.stepId } : { kind: "snapshot" };
    }
    return undefined;
  }
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
