import { RuntimeLeaseStore, runtimeLeaseStore } from "../pool/leaseStore";

export interface CancelSignal {
  runId: string;
  requestedAt: string;
  reason?: string;
}

function toTime(value?: string): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export class CancelRegistry {
  constructor(private store: RuntimeLeaseStore = runtimeLeaseStore()) {}
  request(runId: string, reason?: string): CancelSignal {
    this.store.requestCancel(runId, reason);
    const row = this.store.cancelRequested(runId)!;
    return { runId: row.run_id, requestedAt: row.requested_at, reason: row.reason };
  }
  signal(runId: string): CancelSignal | undefined {
    const row = this.store.cancelRequested(runId);
    return row ? { runId: row.run_id, requestedAt: row.requested_at, reason: row.reason } : undefined;
  }
  isCancelled(runId: string): boolean { return !!this.store.cancelRequested(runId); }
  isCancelledAfter(runId: string, after?: string): boolean {
    const row = this.store.cancelRequested(runId);
    if (!row) return false;
    return !after || toTime(row.requested_at) > toTime(after);
  }
  throwIfCancelled(runId: string, after?: string): void {
    const row = this.store.cancelRequested(runId);
    if (!row) return;
    if (after && toTime(row.requested_at) <= toTime(after)) return;
    const error: any = new Error(`CANCELLED: run ${runId} was cancelled${row.reason ? `: ${row.reason}` : ""}`);
    error.status = "cancelled";
    throw error;
  }
  clear(runId: string): void { this.store.clearCancelRequest(runId); }
}

export const cancelRegistry = new CancelRegistry();
export function requestCancel(runId: string, reason?: string): CancelSignal { return cancelRegistry.request(runId, reason); }
export function throwIfCancelled(runId: string, after?: string): void { cancelRegistry.throwIfCancelled(runId, after); }
