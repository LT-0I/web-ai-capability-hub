const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../../capabilities/database";
import { RunEventRecord } from "../../capabilities/schemas";
import { cancelRegistry, CancelRegistry } from "../cancel/registry";
import { HealService, healService } from "../heal/service";
import { profilePool, ProfilePool } from "../pool/profilePool";
import { RuntimeLeaseStore, runtimeLeaseStore } from "../pool/leaseStore";
import { loadManifestsFrom } from "../../registry/manifest/loader";
import { CapabilityManifest } from "../../registry/manifest/schema";
import { actionDsl, ActionKind } from "./actionDsl";

export type RunState = "Created" | "PolicyCheck" | "AwaitingApproval" | "Planning" | "Observing" | "Executing" | "Recovering" | "Extracting" | "PersistingEvidence" | "Completed" | "Failed" | "Cancelled" | "HumanHandoff";

export interface LifecycleEvent {
  state: RunState;
  at: string;
}

export interface EngineRunEvent {
  kind: string;
  status?: string;
  at: string;
  stepId?: string;
  payload?: Record<string, unknown>;
  errorCode?: string;
}

export interface RunResult {
  ok: boolean;
  status: Lowercase<RunState> | "dry-run";
  runId: string;
  manifestId: string;
  events: LifecycleEvent[];
  runEvents: EngineRunEvent[];
  result?: unknown;
  errorCode?: string;
  error?: string;
}

export interface ExecutionRuntime {
  database?: CapabilityDatabase;
  cancelRegistry?: CancelRegistry;
  healService?: HealService;
  profilePool?: ProfilePool;
  leaseStore?: RuntimeLeaseStore;
  page?: any;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  heartbeatIntervalMs?: number;
  heartbeatAfterMs?: number;
  leaseRenewBeforeMs?: number;
  onRunEvent?: (event: EngineRunEvent) => void | Promise<void>;
}

interface PlannedAction {
  stepId: string;
  kind: ActionKind;
  selectorRole?: string;
  selector?: string;
  text?: string;
  url?: string;
  key?: string;
}

interface ManagedLease {
  leaseId: string;
  releaseFn?: (status?: "released" | "cancelled" | "expired") => Promise<void>;
  heartbeat?: () => void;
  renew?: (ttlSeconds?: number) => void;
}

class CancelledRunError extends Error {
  status = "cancelled";
  constructor(readonly signal?: { runId: string; requestedAt: string; reason?: string }) {
    super(`CANCELLED: run ${signal?.runId || "unknown"}${signal?.reason ? `: ${signal.reason}` : ""}`);
  }
}

function makeRunId(manifestId: string): string { return `run_${crypto.createHash("sha1").update(`${manifestId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16)}`; }
function terminal(state: RunState): Lowercase<RunState> { return state.toLowerCase() as Lowercase<RunState>; }
function eventId(): string { return `event_${crypto.randomBytes(8).toString("hex")}`; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function msFromSeconds(seconds: number): number { return Math.max(1, Math.floor(seconds * 1000)); }

function createNoopPage(): any {
  const locator = () => ({
    first: () => locator(),
    count: async () => 1,
    click: async () => undefined,
    fill: async () => undefined,
    selectOption: async () => undefined,
    innerText: async () => ""
  });
  return {
    url: () => "about:blank",
    title: async () => "",
    locator,
    getByRole: () => ({ count: async () => 0, first: () => locator() }),
    keyboard: { press: async () => undefined },
    goto: async () => undefined,
    waitForSelector: async () => undefined,
    screenshot: async () => undefined
  };
}

function manifestLeaseTtlMs(manifest: CapabilityManifest | undefined, input: Record<string, unknown>): number {
  const explicit = Number(input.lease_ttl_ms ?? input.leaseTtlMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  for (const condition of manifest?.preconditions || []) {
    const value = Number((condition as any).lease_ttl_ms ?? (condition as any).leaseTtlMs);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 300_000;
}

function selectorFromManifest(manifest: CapabilityManifest | undefined, role: string, fallback: string): string {
  const selector = manifest?.selectors?.[role]?.primary || manifest?.selectors?.[role]?.candidates?.find((candidate) => candidate.css)?.css;
  return selector || fallback;
}

function buildActionPlan(manifestId: string, manifest: CapabilityManifest | undefined, input: Record<string, unknown>): PlannedAction[] {
  const operation = String(manifest?.operation || manifestId.split(".").at(-1) || "run");
  const observeSelector = String(input.observe_selector || selectorFromManifest(manifest, "observe", `[data-wah-observe="${operation}"]`));
  const actionSelector = String(input.selector || selectorFromManifest(manifest, "primary", `[data-wah-action="${operation}"]`));
  const text = String(input.prompt ?? input.query ?? input.text ?? "wah-smoke");
  const actions: PlannedAction[] = [
    { stepId: "01-observe", kind: "observe", selectorRole: "observe", selector: observeSelector }
  ];
  if (/send|prompt|query|search|filter|import|workspace|conversation|generate|upload|edit|submit/i.test(operation)) {
    actions.push({ stepId: "02-type", kind: "type", selectorRole: "primary", selector: actionSelector, text });
  } else {
    actions.push({ stepId: "02-click", kind: "click", selectorRole: "primary", selector: actionSelector });
  }
  return actions;
}

function completedActionStepIds(database: CapabilityDatabase | undefined, runId: string): Set<string> {
  const completed = new Set<string>();
  if (!database) return completed;
  for (const event of database.listRunEvents(runId)) {
    if (String(event.event_type || "").startsWith("action.") && event.status === "succeeded" && event.step_id) completed.add(event.step_id);
  }
  return completed;
}

function resolveHandlerModule(refPath: string): string {
  const normalized = refPath.replace(/^\.\//, "").replace(/\.ts$/, ".js");
  const distCandidate = path.join(process.cwd(), "dist", normalized);
  if (fs.existsSync(distCandidate)) return distCandidate;
  const sourceCandidate = path.join(process.cwd(), refPath.replace(/^\.\//, ""));
  return sourceCandidate;
}

export class ExecutionEngine {
  constructor(private runtime: ExecutionRuntime = {}) {}

  static async run(manifestId: string, input: Record<string, unknown> = {}, runtime: ExecutionRuntime = {}): Promise<RunResult> {
    return new ExecutionEngine(runtime).run(manifestId, input);
  }

  private now(): Date { return this.runtime.now?.() || new Date(); }
  private iso(): string { return this.now().toISOString(); }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    if (this.runtime.sleep) return this.runtime.sleep(ms);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async run(manifestId: string, input: Record<string, unknown> = {}): Promise<RunResult> {
    const runId = String(input.run_id || input.runId || makeRunId(manifestId));
    const resumeOf = typeof input.resume_of === "string" ? input.resume_of : typeof input.resumeOf === "string" ? input.resumeOf : undefined;
    const resumeStartedAt = resumeOf ? this.iso() : undefined;
    const events: LifecycleEvent[] = [];
    const runEvents: EngineRunEvent[] = [];
    const cancel = this.runtime.cancelRegistry || cancelRegistry;
    const database = this.runtime.database;
    const leaseStore = this.runtime.leaseStore || runtimeLeaseStore();
    const managedLeases: ManagedLease[] = [];
    const releasedLeaseIds = new Set<string>();
    const startedAt = this.iso();
    let manifest: CapabilityManifest | undefined;
    let leaseTtlMs = 300_000;
    let executingStartedMs = 0;
    let nextHeartbeatAtMs = 0;
    let renewed = false;
    const deferInitialCancelUntilLease = Boolean(input.profile || input.profileId);
    let cancellationArmed = !deferInitialCancelUntilLease;

    const persistWorkflowRun = (status: string, result?: Record<string, unknown>) => {
      database?.addWorkflowRun({
        id: runId,
        workflow_id: manifestId,
        target_id: manifest?.target?.provider,
        profile: typeof input.profile === "string" ? input.profile : typeof input.profileId === "string" ? input.profileId : undefined,
        mode: "execution-engine",
        status,
        started_at: startedAt,
        finished_at: ["completed", "failed", "cancelled", "humanhandoff"].includes(status) ? this.iso() : undefined,
        plan: { manifestId, resumeOf, action_count: manifest ? buildActionPlan(manifestId, manifest, input).length : undefined },
        result
      });
    };

    const emitRunEvent = async (kind: string, status?: string, payload?: Record<string, unknown>, stepId?: string, errorCode?: string) => {
      const event: EngineRunEvent = { kind, status, at: this.iso(), stepId, payload, errorCode };
      runEvents.push(event);
      database?.addRunEvent({
        id: eventId(),
        run_id: runId,
        step_id: stepId,
        event_type: kind,
        status,
        timestamp: event.at,
        payload,
        error_code: errorCode,
        evidence: payload
      } as RunEventRecord);
      await this.runtime.onRunEvent?.(event);
    };

    const checkCancel = () => {
      if (!cancellationArmed) return;
      if (!cancel.isCancelledAfter(runId, resumeStartedAt)) return;
      throw new CancelledRunError(cancel.signal(runId));
    };

    const emitState = async (state: RunState) => {
      checkCancel();
      events.push({ state, at: this.iso() });
      await emitRunEvent(`lifecycle.${state.toLowerCase()}`, state === "Completed" ? "succeeded" : "started", { state });
      await Promise.resolve();
    };

    const releaseLeases = async (status: "released" | "cancelled" | "expired" = "released") => {
      for (const lease of [...managedLeases].reverse()) {
        if (!lease?.leaseId || releasedLeaseIds.has(lease.leaseId)) continue;
        releasedLeaseIds.add(lease.leaseId);
        await lease.releaseFn?.(status).catch(() => undefined);
      }
    };

    const maintainLeases = async () => {
      if (!executingStartedMs) return;
      const nowMs = this.now().getTime();
      if (nowMs >= nextHeartbeatAtMs) {
        for (const lease of managedLeases) lease.heartbeat?.();
        await emitRunEvent("lease.heartbeat", "succeeded", { lease_count: managedLeases.length });
        nextHeartbeatAtMs = nowMs + (this.runtime.heartbeatIntervalMs ?? 60_000);
      }
      const renewBeforeMs = this.runtime.leaseRenewBeforeMs ?? 30_000;
      if (!renewed && nowMs - executingStartedMs >= Math.max(0, leaseTtlMs - renewBeforeMs)) {
        const ttlSeconds = Math.ceil(leaseTtlMs / 1000);
        for (const lease of managedLeases) lease.renew?.(ttlSeconds);
        await emitRunEvent("lease.renew", "succeeded", { lease_count: managedLeases.length, ttl_ms: leaseTtlMs });
        renewed = true;
      }
    };

    const simulateExecutingDelay = async (durationMs: number) => {
      if (!durationMs) return;
      const targetMs = this.now().getTime() + durationMs;
      while (this.now().getTime() < targetMs) {
        const nextMs = Math.min(targetMs, nextHeartbeatAtMs || targetMs);
        await this.sleep(Math.max(0, nextMs - this.now().getTime()));
        await maintainLeases();
        checkCancel();
      }
    };

    const resolveSelector = async (page: any, action: PlannedAction): Promise<string | undefined> => {
      if (!action.selector || !action.selectorRole) return action.selector;
      const resolution = await (this.runtime.healService || healService).resolve(page, {
        runId,
        manifestId,
        selectorRole: action.selectorRole,
        primarySelector: action.selector,
        ariaRole: action.kind === "type" ? "textbox" : "button",
        ariaName: action.kind === "type" ? "Prompt" : action.selectorRole,
        nearText: String(input.prompt ?? input.query ?? action.selectorRole),
        domFingerprint: `${manifestId}:${action.selectorRole}`,
        healPolicy: manifest?.selectors?.[action.selectorRole]?.heal_policy || "report"
      });
      await emitRunEvent("selector.resolve", resolution.degraded ? "failed" : "succeeded", {
        selector_role: action.selectorRole,
        degraded: resolution.degraded,
        confidence: resolution.confidence,
        errorCode: resolution.errorCode,
        selector: resolution.selector
      }, action.stepId, resolution.errorCode);
      return resolution.selector || action.selector;
    };

    const runAction = async (page: any, action: PlannedAction) => {
      const selector = await resolveSelector(page, action);
      const ctx = {
        runId,
        manifestId,
        page,
        emit: async (event: any) => emitRunEvent(`action.${event.action}`, event.status, event.payload, action.stepId)
      };
      if (action.kind === "observe") await actionDsl.observe(ctx);
      else if (action.kind === "click") await actionDsl.click(ctx, selector || "body");
      else if (action.kind === "type") await actionDsl.type(ctx, selector || "body", action.text || "");
      else if (action.kind === "open") await actionDsl.open(ctx, action.url || String(input.url || "about:blank"));
      else if (action.kind === "press") await actionDsl.press(ctx, action.key || "Enter");
      else await emitRunEvent(`action.${action.kind}`, "succeeded", { skipped: true }, action.stepId);
      checkCancel();
      await maintainLeases();
    };

    const invokeManifestHandler = async (): Promise<unknown> => {
      if (!manifest || !["webai", "researchdb"].includes(manifest.target.kind)) return undefined;
      const handlerRef = manifest.direct?.handler || manifest.recipe?.handler;
      if (!handlerRef) return undefined;
      const [moduleRef, symbol] = handlerRef.split("#");
      if (!moduleRef || !symbol) return undefined;
      const mod = require(resolveHandlerModule(moduleRef));
      const handler = mod?.[symbol];
      if (typeof handler !== "function") {
        const error: any = new Error(`INVALID_ARGS: manifest handler ${handlerRef} could not be resolved`);
        error.errorCode = "INVALID_ARGS";
        throw error;
      }
      const handlerInput = {
        ...input,
        manifest_id: manifestId,
        run_id: runId,
        provider: manifest.target.provider,
        service: manifest.target.provider,
        operation: manifest.operation,
        __manifest: manifest
      };
      await emitRunEvent(manifest.kind === "recipe" ? "handler.recipe" : "handler.direct", "started", { handler: handlerRef });
      const output = await handler(handlerInput, this.runtime);
      await emitRunEvent(manifest.kind === "recipe" ? "handler.recipe" : "handler.direct", "succeeded", { handler: handlerRef });
      return output;
    };

    try {
      persistWorkflowRun("running");
      await emitState("Created");
      await emitState("PolicyCheck");
      const loaded = loadManifestsFrom(process.cwd() + "/configs/adapters");
      manifest = loaded.manifests.find((item) => item.id === manifestId);
      leaseTtlMs = manifestLeaseTtlMs(manifest, input);
      if ((input as any).dry_run || (input as any).dryRun) {
        cancellationArmed = true;
        checkCancel();
        const result = { manifest: manifest ? { id: manifest.id, operation: manifest.operation, safety: manifest.safety } : null, input };
        persistWorkflowRun("completed", { status: "dry-run", result });
        return { ok: true, status: "dry-run", runId, manifestId, events, runEvents, result };
      }
      if (manifest?.safety?.requiresApproval && (input as any).confirmed !== true && (input as any).approved !== true) {
        cancellationArmed = true;
        checkCancel();
        await emitState("AwaitingApproval");
        persistWorkflowRun("humanhandoff", { errorCode: "POLICY_APPROVAL_REQUIRED" });
        return { ok: false, status: "humanhandoff", runId, manifestId, events, runEvents, errorCode: "POLICY_APPROVAL_REQUIRED", error: "approval required" };
      }

      await emitState("Planning");
      const plan = buildActionPlan(manifestId, manifest, input);
      const completedSteps = resumeOf ? completedActionStepIds(database, resumeOf) : new Set<string>();

      let lease: any;
      if (input.profile || input.profileId) {
        lease = await (this.runtime.profilePool || profilePool).acquireProfile(String(input.profile || input.profileId), runId, {
          url: typeof input.url === "string" ? input.url : undefined,
          urlMatch: typeof input.urlMatch === "string" ? input.urlMatch : typeof input.tab_url_contains === "string" ? input.tab_url_contains : undefined,
          ttlSeconds: Math.ceil(leaseTtlMs / 1000)
        });
        managedLeases.push(lease);
        await emitRunEvent("lease.profile.acquired", "succeeded", { lease_id: lease.leaseId, profile: String(input.profile || input.profileId) });
        cancellationArmed = true;
        checkCancel();
      }

      const page = this.runtime.page || lease?.page || createNoopPage();
      const observeActions = plan.filter((action) => action.kind === "observe");
      const executeActions = plan.filter((action) => action.kind !== "observe");

      await emitState("Observing");
      for (const action of observeActions) {
        if (completedSteps.has(action.stepId)) {
          await emitRunEvent("resume.skip_completed_action", "succeeded", { step_id: action.stepId }, action.stepId);
          continue;
        }
        await runAction(page, action);
      }

      await emitState("Executing");
      executingStartedMs = this.now().getTime();
      nextHeartbeatAtMs = executingStartedMs + (this.runtime.heartbeatIntervalMs ?? 60_000);
      for (const action of executeActions) {
        if (completedSteps.has(action.stepId)) {
          await emitRunEvent("resume.skip_completed_action", "succeeded", { step_id: action.stepId }, action.stepId);
          continue;
        }
        await runAction(page, action);
      }
      await simulateExecutingDelay(Number(input.simulate_execution_ms ?? input.execution_ms ?? 0));

      const handlerResult = await invokeManifestHandler();
      const result = { ok: true, manifestId, runId, accepted: true, cdpEndpoint: lease ? "redacted" : undefined, resumedFrom: resumeOf, handlerResult };
      await emitState("Extracting");
      await emitRunEvent("action.extract", "succeeded", { bytes: 0 }, "03-extract");
      await emitState("PersistingEvidence");
      await emitRunEvent("persist.evidence", "succeeded", { action_count: plan.length, drift_events: leaseStore.listDriftEvents().filter((row: any) => row.run_id === runId).length }, "04-persist");
      await releaseLeases("released");
      await emitState("Completed");
      persistWorkflowRun("completed", result);
      return { ok: true, status: terminal("Completed"), runId, manifestId, events, runEvents, result };
    } catch (error: any) {
      const cancelled = error?.status === "cancelled" || /CANCELLED/.test(error?.message || "");
      if (cancelled) {
        await releaseLeases("cancelled");
        const at = this.iso();
        events.push({ state: "Cancelled", at });
        await emitRunEvent("lifecycle.cancelled", "succeeded", { reason: error?.signal?.reason || error?.message });
        persistWorkflowRun("cancelled", { status: "cancelled" });
        return { ok: false, status: "cancelled", runId, manifestId, events, runEvents, error: error?.message || String(error) };
      }
      await releaseLeases("expired");
      const at = this.iso();
      events.push({ state: "Failed", at });
      await emitRunEvent("lifecycle.failed", "failed", { error: error?.message || String(error) }, undefined, error?.errorCode || "UNKNOWN");
      persistWorkflowRun("failed", { errorCode: error?.errorCode || "UNKNOWN", error: error?.message || String(error) });
      return { ok: false, status: "failed", runId, manifestId, events, runEvents, errorCode: error?.errorCode || "UNKNOWN", error: error?.message || String(error) };
    }
  }
}

export const defaultExecutionEngine = new ExecutionEngine({ healService });
