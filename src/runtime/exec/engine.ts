const crypto = require("node:crypto");
import { CapabilityDatabase } from "../../capabilities/database";
import { cancelRegistry, CancelRegistry } from "../cancel/registry";
import { HealService, healService } from "../heal/service";
import { profilePool, ProfilePool } from "../pool/profilePool";
import { loadManifestsFrom } from "../../registry/manifest/loader";

export type RunState = "Created" | "PolicyCheck" | "AwaitingApproval" | "Planning" | "Observing" | "Executing" | "Recovering" | "Extracting" | "PersistingEvidence" | "Completed" | "Failed" | "Cancelled" | "HumanHandoff";

export interface RunResult {
  ok: boolean;
  status: Lowercase<RunState> | "dry-run";
  runId: string;
  manifestId: string;
  events: Array<{ state: RunState; at: string }>;
  result?: unknown;
  errorCode?: string;
  error?: string;
}

export interface ExecutionRuntime {
  database?: CapabilityDatabase;
  cancelRegistry?: CancelRegistry;
  healService?: HealService;
  profilePool?: ProfilePool;
  now?: () => Date;
}

function now(runtime?: ExecutionRuntime): string { return (runtime?.now?.() || new Date()).toISOString(); }
function makeRunId(manifestId: string): string { return `run_${crypto.createHash("sha1").update(`${manifestId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16)}`; }
function terminal(state: RunState): Lowercase<RunState> { return state.toLowerCase() as Lowercase<RunState>; }

export class ExecutionEngine {
  constructor(private runtime: ExecutionRuntime = {}) {}

  static async run(manifestId: string, input: Record<string, unknown> = {}, runtime: ExecutionRuntime = {}): Promise<RunResult> {
    return new ExecutionEngine(runtime).run(manifestId, input);
  }

  async run(manifestId: string, input: Record<string, unknown> = {}): Promise<RunResult> {
    const runId = String(input.run_id || input.runId || makeRunId(manifestId));
    const events: RunResult["events"] = [];
    const cancel = this.runtime.cancelRegistry || cancelRegistry;
    const emit = async (state: RunState) => {
      cancel.throwIfCancelled(runId);
      events.push({ state, at: now(this.runtime) });
      await Promise.resolve();
    };

    try {
      await emit("Created");
      await emit("PolicyCheck");
      const { manifests } = loadManifestsFrom(process.cwd() + "/configs/adapters");
      const manifest = manifests.find((item) => item.id === manifestId);
      if ((input as any).dry_run || (input as any).dryRun) {
        return { ok: true, status: "dry-run", runId, manifestId, events, result: { manifest: manifest ? { id: manifest.id, operation: manifest.operation, safety: manifest.safety } : null, input } };
      }
      if (manifest?.safety?.requiresApproval && (input as any).confirmed !== true && (input as any).approved !== true) {
        await emit("AwaitingApproval");
        return { ok: false, status: "humanhandoff", runId, manifestId, events, errorCode: "POLICY_APPROVAL_REQUIRED", error: "approval required" };
      }
      await emit("Planning");
      await emit("Observing");
      let lease: any;
      if (input.profile || input.profileId) {
        lease = await (this.runtime.profilePool || profilePool).acquireProfile(String(input.profile || input.profileId), runId, { url: typeof input.url === "string" ? input.url : undefined, urlMatch: typeof input.urlMatch === "string" ? input.urlMatch : typeof input.tab_url_contains === "string" ? input.tab_url_contains : undefined });
      }
      await emit("Executing");
      const result = { ok: true, manifestId, runId, accepted: true, cdpEndpoint: lease ? "redacted" : undefined };
      await emit("Extracting");
      await emit("PersistingEvidence");
      await lease?.releaseFn?.();
      await emit("Completed");
      return { ok: true, status: terminal("Completed"), runId, manifestId, events, result };
    } catch (error: any) {
      const cancelled = error?.status === "cancelled" || /CANCELLED/.test(error?.message || "");
      events.push({ state: cancelled ? "Cancelled" : "Failed", at: now(this.runtime) });
      return { ok: false, status: cancelled ? "cancelled" : "failed", runId, manifestId, events, errorCode: error?.errorCode || "UNKNOWN", error: error?.message || String(error) };
    }
  }
}

export const defaultExecutionEngine = new ExecutionEngine({ healService });
