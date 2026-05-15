import { ConsumerErrorCodes } from "../consumer/errorCodes";

export const PROMPT_DENY_KEYWORDS = [
  "publish",
  "share publicly",
  "public link",
  "invite collaborator",
  "invite collaborators",
  "enable connector",
  "enable connectors",
  "alter billing",
  "change billing",
  "create scheduled action",
  "schedule this action",
  "change account setting",
  "change account settings"
] as const;

export class PromptPolicyDeniedError extends Error {
  errorCode = ConsumerErrorCodes.POLICY_APPROVAL_REQUIRED;
  evidence: { matched_keyword: string };
  constructor(keyword: string) {
    super(`POLICY_APPROVAL_REQUIRED: prompt contains policy-gated keyword: ${keyword}`);
    this.evidence = { matched_keyword: keyword };
  }
}

export function findPromptDeniedKeyword(prompt: unknown): string | undefined {
  if (typeof prompt !== "string") return undefined;
  const normalized = prompt.toLowerCase();
  return PROMPT_DENY_KEYWORDS.find((keyword) => normalized.includes(keyword));
}

export function assertPromptAllowed(prompt: unknown): void {
  const keyword = findPromptDeniedKeyword(prompt);
  if (keyword) throw new PromptPolicyDeniedError(keyword);
}
