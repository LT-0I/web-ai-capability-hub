export const CONSUMER_ERROR_CODES = [
  "HUB_NOT_BUILT",
  "BROWSER_NOT_LAUNCHED",
  "PROFILE_NOT_FOUND",
  "TARGET_PAGE_MISSING",
  "LOGIN_REQUIRED",
  "CAPABILITY_DB_NOT_INIT",
  "COMMAND_TIMEOUT",
  "INVALID_ARGS",
  "INVALID_JSON",
  "POLICY_APPROVAL_REQUIRED",
  "UNKNOWN"
] as const;

export type ConsumerErrorCode = typeof CONSUMER_ERROR_CODES[number];

export const ConsumerErrorCodes: Record<ConsumerErrorCode, ConsumerErrorCode> = Object.freeze(
  CONSUMER_ERROR_CODES.reduce((acc, code) => {
    acc[code] = code;
    return acc;
  }, {} as Record<ConsumerErrorCode, ConsumerErrorCode>)
);

export function isConsumerErrorCode(value: unknown): value is ConsumerErrorCode {
  return typeof value === "string" && (CONSUMER_ERROR_CODES as readonly string[]).includes(value);
}
