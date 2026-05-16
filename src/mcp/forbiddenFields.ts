const fs = require("node:fs");
const path = require("node:path");
import { ConsumerErrorCodes } from "../consumer/errorCodes";

function loadConsumerContract(): any {
  const candidates = [
    path.resolve(process.cwd(), "configs/consumer-contract.json"),
    path.resolve(__dirname, "../../configs/consumer-contract.json"),
    path.resolve(__dirname, "../../../configs/consumer-contract.json")
  ];
  const contractPath = candidates.find((candidate: string) => fs.existsSync(candidate));
  if (!contractPath) throw new Error("Unable to locate configs/consumer-contract.json for forbidden field enforcement");
  return JSON.parse(fs.readFileSync(contractPath, "utf-8"));
}

const contractForbiddenFields = loadConsumerContract().forbidden_output_fields;
if (!Array.isArray(contractForbiddenFields)) throw new Error("consumer contract missing forbidden_output_fields array");

export const forbiddenOutputFields = new Set<string>(contractForbiddenFields.map((field: unknown) => String(field)));
export const forbiddenOutputFieldList = Object.freeze([...forbiddenOutputFields]);

export class ForbiddenOutputFieldError extends Error {
  errorCode: string;
  evidence: Record<string, unknown>;

  constructor(fields: string[]) {
    const uniqueFields = [...new Set(fields)];
    super(`${ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED}: tool response contains forbidden field(s): ${uniqueFields.join(", ")}`);
    this.errorCode = ConsumerErrorCodes.SAFE_OUTPUT_REDACTION_REQUIRED;
    this.evidence = { fields: uniqueFields };
  }
}

function collectForbiddenKeys(value: unknown): string[] {
  const seen: string[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenOutputFields.has(key)) seen.push(key);
      visit(child);
    }
  };
  visit(value);
  return [...new Set(seen)];
}

export function assertNoForbidden(value: unknown): void {
  const fields = collectForbiddenKeys(value);
  if (fields.length) throw new ForbiddenOutputFieldError(fields);
}

export function stripForbidden<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripForbidden(item)) as T;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenOutputFields.has(key)) continue;
    safe[key] = stripForbidden(child);
  }
  return safe as T;
}
