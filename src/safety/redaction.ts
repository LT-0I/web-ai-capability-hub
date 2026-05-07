const SENSITIVE_KEY_RE = /(password|passwd|secret|token|cookie|authorization|auth|api[_-]?key|credential|session|csrf|bearer)/i;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const COOKIE_RE = /((?:^|;\s*)[A-Za-z0-9_.-]+)=([^;]{16,})/g;

export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(BEARER_RE, "Bearer [REDACTED]").replace(COOKIE_RE, "$1=[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redactSensitive(item);
    }
    return out;
  }
  return value;
}

export function redactError(error: unknown): { name: string; message: string; stack?: string } {
  const err = error as { name?: string; message?: string; stack?: string };
  return {
    name: err?.name || "Error",
    message: String(redactSensitive(err?.message || String(error))),
    stack: err?.stack ? String(redactSensitive(err.stack)) : undefined
  };
}
