const fs = require("node:fs");
const path = require("node:path");
import { readConfigFile } from "../utils/yaml";
import { CapabilityDatabase } from "../capabilities/database";
import { CapabilityRecord } from "../capabilities/schemas";
import { BrowserAction } from "../shared/types";
import { SafetyPolicy } from "./safetyPolicy";
import { CompiledWorkflowAction, WorkflowActionPlan, WorkflowDefinition, WorkflowResultSpec, WorkflowStepDefinition } from "./schema";

function now(): string { return new Date().toISOString(); }
function scalar(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function stepId(step: WorkflowStepDefinition, index: number): string { return step.id || step.use_capability || step.capability || step.action || `step-${index + 1}`; }

export class WorkflowCompiler {
  constructor(private database = new CapabilityDatabase(), private safety = new SafetyPolicy()) {}

  load(filePath: string): WorkflowDefinition {
    const definition = readConfigFile(path.resolve(filePath));
    return this.validate(definition, filePath);
  }

  compileFile(filePath: string): WorkflowActionPlan {
    return this.compile(this.load(filePath));
  }

  compile(workflow: WorkflowDefinition): WorkflowActionPlan {
    const warnings: string[] = [];
    const actions: CompiledWorkflowAction[] = [];
    const result = this.validateResultSpec(workflow.result, workflow.id);
    workflow.steps.forEach((step, index) => {
      const capabilityName = step.use_capability || step.capability;
      let capability: CapabilityRecord | undefined;
      if (capabilityName) capability = this.database.getCapabilityByName(workflow.target, capabilityName);
      const action = this.actionForStep(workflow, step, capability, warnings);
      const reason = this.safety.requiresApproval(action, capabilityName);
      actions.push({
        stepId: stepId(step, index),
        capability: capabilityName,
        action,
        requiresApproval: !!reason,
        reason,
        resolvedSelectors: capability?.selectors || action.selector ? [action.selector!].filter(Boolean) : [],
        idempotent: step.idempotent ?? defaultIdempotent(action.type, step.action || capabilityName)
      });
    });
    if (result) this.appendFinalResultAction(actions, result);
    return { id: workflow.id, target: workflow.target, profile: workflow.profile, mode: workflow.mode, compiledAt: now(), actions, warnings, result };
  }

  private validate(input: any, source: string): WorkflowDefinition {
    if (!input || typeof input !== "object") throw new Error(`Workflow ${source} must be an object`);
    if (!input.id || !input.target) throw new Error(`Workflow ${source} requires id and target`);
    if (!Array.isArray(input.steps)) throw new Error(`Workflow ${source} requires steps[]`);
    return input as WorkflowDefinition;
  }

  private validateResultSpec(result: WorkflowResultSpec | undefined, workflowId: string): WorkflowResultSpec | undefined {
    if (!result) return undefined;
    if (!result.type) throw new Error(`Workflow ${workflowId} result requires type`);
    if (!["screenshot", "download", "text", "snapshot", "none"].includes(result.type)) throw new Error(`Workflow ${workflowId} result.type is not supported: ${result.type}`);
    return result;
  }

  private appendFinalResultAction(actions: CompiledWorkflowAction[], result: WorkflowResultSpec): void {
    if (result.type === "none" || result.type === "download") return;
    const action: BrowserAction = result.type === "screenshot"
      ? { type: "screenshot", confirmed: true }
      : { type: "extract", extract: result.type, confirmed: true };
    actions.push({
      stepId: `final-${result.type}`,
      action,
      requiresApproval: false,
      resolvedSelectors: [],
      idempotent: defaultIdempotent(action.type, result.type)
    });
  }

  private actionForStep(workflow: WorkflowDefinition, step: WorkflowStepDefinition, capability: CapabilityRecord | undefined, warnings: string[]): BrowserAction {
    if (step.action && !["observe", "read", "clear_draft"].includes(step.action)) {
      return { type: step.action as BrowserAction["type"], target: step.target as any, selector: step.selector || capability?.selectors?.[0], text: scalar(step.text || step.input?.text), files: step.files || (Array.isArray(step.input?.files) ? step.input?.files as string[] : undefined), waitFor: step.waitFor, timeoutMs: step.timeoutMs, confirmed: step.confirmed, riskyReason: step.riskyReason, until: step.until, untilSelector: step.untilSelector, untilContentRegex: step.untilContentRegex, untilStableMs: step.untilStableMs, untilTimeoutMs: step.untilTimeoutMs };
    }
    const name = step.use_capability || step.capability || step.action || "observe";
    const selector = capability?.selectors?.[0];
    switch (name) {
      case "open_image_generation":
        return { type: "click", selector, target: selector ? undefined : { role: "button", name: "image" }, confirmed: step.confirmed };
      case "enter_prompt":
        return { type: "type", selector, target: selector ? undefined : { role: "textbox", name: "prompt" }, text: scalar(step.input?.text) || scalar(step.text) || "", confirmed: step.confirmed };
      case "verify_draft":
      case "observe":
      case "read":
        return { type: "extract", extract: "snapshot", confirmed: true };
      case "clear_draft":
        return { type: "press", selector, target: selector ? undefined : { role: "textbox", name: "prompt" }, key: process.platform === "darwin" ? "Meta+A" : "Control+A", confirmed: true };
      case "send_message":
        return { type: "click", selector, target: selector ? undefined : { role: "button", name: "send" }, riskyReason: "Sending messages to web AI requires explicit approval.", confirmed: step.confirmed };
      case "upload_file":
        return { type: "upload", selector, target: selector ? undefined : { role: "textbox", name: "file" }, files: step.files || (Array.isArray(step.input?.files) ? step.input?.files as string[] : []), riskyReason: "File upload requires explicit approval.", confirmed: step.confirmed };
      case "download_or_export":
        return { type: "download", selector, target: selector ? undefined : { role: "button", name: "download" }, riskyReason: "Download/export requires explicit approval.", confirmed: step.confirmed };
      case "enter_search_query":
        return { type: "type", selector, target: selector ? undefined : { role: "textbox", name: "search" }, text: scalar(step.input?.query || step.input?.text) || scalar(step.text) || "", confirmed: step.confirmed };
      default:
        warnings.push(`No exact compiler rule for capability '${name}'. Falling back to read/observe action.`);
        return { type: "extract", extract: "snapshot", confirmed: true };
    }
  }
}

function defaultIdempotent(actionType: BrowserAction["type"], stepKind?: string): boolean {
  if (stepKind === "verify" || stepKind === "artifact-click") return true;
  return actionType === "wait" || actionType === "download";
}

export function listWorkflowFiles(root = process.cwd()): string[] {
  const dirs = [path.join(root, "examples", "workflows"), path.join(root, "configs", "workflows")];
  const files: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) if (/\.(ya?ml|json)$/i.test(entry)) files.push(path.join(dir, entry));
  }
  return files;
}
