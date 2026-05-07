import { BrowserAction } from "../shared/types";
import { describeSemanticTarget } from "./semanticTargets";

export type ConfirmationMode = "always" | "confirm-risky" | "never";

export interface ConfirmationPolicy {
  mode: ConfirmationMode;
  autoConfirm?: boolean;
}

export class ConfirmationRequiredError extends Error {
  constructor(readonly action: BrowserAction, readonly reason: string) {
    super(`Human confirmation required before ${action.type}: ${reason}`);
    this.name = "ConfirmationRequiredError";
  }
}

const RISK_WORDS = /(send|submit|delete|remove|export|download|purchase|buy|pay|share|publish|login|sign in|sign-in|mfa|2fa|captcha|settings|account)/i;

export function riskyReason(action: BrowserAction): string | undefined {
  if (["download", "upload"].includes(action.type)) return `${action.type} can move files or paid/private content`;
  if (action.type === "open" && action.url && !/^https?:|^file:|^about:/i.test(action.url)) return "Opening a non-web scheme can hand control to another local application";
  if (action.type === "click" || action.type === "type" || action.type === "press" || action.type === "select") {
    const haystack = `${describeSemanticTarget(action.target, action.selector)} ${action.text || ""} ${action.key || ""}`.replace(/\s+/g, " ");
    if (RISK_WORDS.test(haystack)) return `Target or content looks sensitive: ${haystack.slice(0, 120)}`;
  }
  if (action.riskyReason) return action.riskyReason;
  return undefined;
}

export function requiresApproval(action: BrowserAction, policy: ConfirmationPolicy = defaultConfirmationPolicy()): boolean {
  if (action.dryRun) return false;
  if (policy.autoConfirm || action.confirmed) return false;
  if (policy.mode === "never") return false;
  const reason = riskyReason(action);
  return policy.mode === "always" || !!reason;
}

export function assertActionPermitted(action: BrowserAction, policy: ConfirmationPolicy): void {
  if (!requiresApproval(action, policy)) return;
  const reason = riskyReason(action);
  if (policy.mode === "always" || reason) throw new ConfirmationRequiredError(action, reason || "Policy requires confirmation for every browser action");
}

export function defaultConfirmationPolicy(): ConfirmationPolicy {
  const env = process.env.WAH_CONFIRMATION_MODE as ConfirmationMode | undefined;
  return { mode: env || "confirm-risky", autoConfirm: process.env.WAH_AUTO_CONFIRM === "true" };
}
