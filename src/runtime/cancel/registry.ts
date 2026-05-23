import { RuntimeLeaseStore, runtimeLeaseStore } from "../pool/leaseStore";

export interface CancelSignal {
  runId: string;
  requestedAt: string;
  reason?: string;
}

export class CancelRegistry {
  constructor(private store: RuntimeLeaseStore = runtimeLeaseStore()) {}
  request(runId: string, reason?: string): CancelSignal {
    this.store.requestCancel(runId, reason);
    const row = this.store.cancelRequested(runId)!;
    return { runId: row.run_id, requestedAt: row.requested_at, reason: row.reason };
  }
  isCancelled(runId: string): boolean { return !!this.store.cancelRequested(runId); }
  throwIfCancelled(runId: string): void {
    const row = this.store.cancelRequested(runId);
    if (!row) return;
    const error: any = new Error(`CANCELLED: run ${runId} was cancelled${row.reason ? `: ${row.reason}` : ""}`);
    error.errorCode = "HUMAN_HANDOFF_REQUIRED";
    error.status = "cancelled";
    throw error;
  }
}

export const cancelRegistry = new CancelRegistry();
export function requestCancel(runId: string, reason?: string): CancelSignal { return cancelRegistry.request(runId, reason); }
export function throwIfCancelled(runId: string): void { cancelRegistry.throwIfCancelled(runId); }
