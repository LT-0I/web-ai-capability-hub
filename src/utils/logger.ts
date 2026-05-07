import { optionalRequire } from "./optionalRequire";
import { redactSensitive } from "../safety/redaction";

export interface Logger {
  debug(obj: unknown, message?: string): void;
  info(obj: unknown, message?: string): void;
  warn(obj: unknown, message?: string): void;
  error(obj: unknown, message?: string): void;
}

function normalize(obj: unknown, message?: string): [unknown, string | undefined] {
  if (typeof obj === "string" && message === undefined) return [{}, obj];
  return [redactSensitive(obj), message];
}

function consoleLogger(level: string): Logger {
  const emit = (method: "debug" | "info" | "warn" | "error", obj: unknown, message?: string) => {
    const [safeObj, msg] = normalize(obj, message);
    const line = { level: method, time: new Date().toISOString(), message: msg || "", data: safeObj };
    const writer = method === "error" ? console.error : method === "warn" ? console.warn : console.log;
    if (level === "debug" || method !== "debug") writer(JSON.stringify(line));
  };
  return {
    debug: (obj, message) => emit("debug", obj, message),
    info: (obj, message) => emit("info", obj, message),
    warn: (obj, message) => emit("warn", obj, message),
    error: (obj, message) => emit("error", obj, message)
  };
}

export function createLogger(name = "web-ai-research-automation-hub"): Logger {
  const level = process.env.WAH_LOG_LEVEL || "info";
  const pino = optionalRequire<any>("pino");
  if (pino) {
    return pino({
      name,
      level,
      redact: {
        paths: ["password", "token", "cookie", "authorization", "headers.authorization", "headers.cookie"],
        censor: "[REDACTED]"
      }
    });
  }
  return consoleLogger(level);
}

export const logger = createLogger();
