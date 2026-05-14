const path = require("node:path");

export interface RedactionOptions {
  mode: "default" | "off" | "strict";
  extraKeyRegex?: RegExp[];
}

const PROFILE_KEY_RE = /^(profileId|profile_id|profile)$/i;
const SENSITIVE_KEY_RE = /(cf-chl-|csrf|session|bearer|cookie|token|authorization|password|secret)/i;
const COOKIE_VALUE_RE = /(?:^|;\s*)[A-Za-z0-9_.-]+=[^;]+(?:;\s*[A-Za-z0-9_.-]+=[^;]+)+/;
const CONVERSATION_URL_RE = /\/c\/[a-f0-9-]{20,}/ig;
const HOME_PATH_RE = /\/home\/[^\s"'<>),;:]+/g;
const PROFILE_VALUE_RE = /^chatgpt$|^claude$|^[a-z0-9-]+$/;

export function redactValue(value: unknown, opts: RedactionOptions = { mode: "default" }): unknown {
  if (opts.mode === "off") return value;
  return redactWalk(value, opts, undefined, new WeakSet<object>());
}

function redactWalk(value: unknown, opts: RedactionOptions, key: string | undefined, seen: WeakSet<object>): unknown {
  if (isSensitiveKey(key, opts)) return "<redacted>";
  if (typeof value === "string") return redactString(value, key, opts);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "<circular>";
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((item) => redactWalk(item, opts, key, seen));
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) out[childKey] = redactWalk(childValue, opts, childKey, seen);
  return out;
}

function isSensitiveKey(key: string | undefined, opts: RedactionOptions): boolean {
  if (!key) return false;
  if (SENSITIVE_KEY_RE.test(key)) return true;
  return !!opts.extraKeyRegex?.some((regex) => regex.test(key));
}

function redactString(input: string, key: string | undefined, opts: RedactionOptions): string {
  if (PROFILE_KEY_RE.test(key || "") && PROFILE_VALUE_RE.test(input)) return "<profile>";
  if (COOKIE_VALUE_RE.test(input)) return "<redacted>";
  let out = input.replace(CONVERSATION_URL_RE, "/c/<conversation-id>");
  out = out.replace(HOME_PATH_RE, (match) => match.replace(/^\/home\/[^/]+/, "<home>"));
  if (opts.mode === "strict" && /^https?:\/\//i.test(out)) out = out.replace(/([?&](?:token|session|csrf|key|code)=)[^&#]+/ig, "$1<redacted>");
  return out;
}
