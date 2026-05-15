import { ConsumerErrorCodes } from "../consumer/errorCodes";

export const PUBLISH_DENY_LABELS = [
  "Share conversation",
  "Create public link",
  "Create share link",
  "Copy public link",
  "Publish",
  "Make public",
  "Post to community",
  "Submit listing",
  "Share Canvas"
] as const;

export class AutoPublishDetectedError extends Error {
  errorCode = ConsumerErrorCodes.AUTO_PUBLISH_DETECTED;
  evidence: Record<string, unknown>;
  constructor(label: string, evidence: Record<string, unknown> = {}) {
    super(`AUTO_PUBLISH_DETECTED: refused publish-class action: ${label}`);
    this.evidence = { label, ...evidence };
  }
}

export function findPublishDeniedLabel(label: unknown): string | undefined {
  if (typeof label !== "string") return undefined;
  const normalized = label.trim().toLowerCase();
  return PUBLISH_DENY_LABELS.find((item) => item.toLowerCase() === normalized);
}

export function assertNotPublishDeniedLabel(label: unknown, evidence: Record<string, unknown> = {}): void {
  const denied = findPublishDeniedLabel(label);
  if (denied) throw new AutoPublishDetectedError(denied, evidence);
}

export async function verifyNoNewPublicLinks(_profile: string, baselineCount: number, currentCount = baselineCount): Promise<{ ok: true } | { ok: false; errorCode: typeof ConsumerErrorCodes.AUTO_PUBLISH_DETECTED; cleanup_attempted: boolean; baselineCount: number; currentCount: number }> {
  if (currentCount > baselineCount) return { ok: false, errorCode: ConsumerErrorCodes.AUTO_PUBLISH_DETECTED, cleanup_attempted: false, baselineCount, currentCount };
  return { ok: true };
}
