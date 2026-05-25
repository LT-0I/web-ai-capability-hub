const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../../capabilities/database";
import { IntegrationRegistryRecord, IntegrationRegistryStatus } from "../../capabilities/schemas";

const VALID_STATUSES = new Set(["IMPLEMENTED_GREEN", "EXPLORED_PATH_KNOWN", "UNEXPLORED", "IN_PROGRESS", "BLOCKED_NEEDS_USER", "OUT_OF_SCOPE", "OK_EXT_BACKEND", "OK_MANAGED_CDP_ONLY", "OK_DEFERRED", "FAIL_CLOSED_EXT_BACKEND", "FAIL_CLOSED_MANAGED", "FAIL_CLOSED_UNSUPPORTED", "FAIL_CLOSED_COMMAND_TIMEOUT"]);

function now(): string { return new Date().toISOString(); }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function featureIdFrom(raw: any, index: number): string {
  return stringValue(raw.feature_id) || stringValue(raw.id) || (stringValue(raw.service) && stringValue(raw.name) ? `${slug(stringValue(raw.service) as string)}-${slug(stringValue(raw.name) as string)}` : undefined) || `feature-${index + 1}`;
}
function recordsFrom(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.features)) return raw.features;
  if (Array.isArray(raw.records)) return raw.records;
  if (Array.isArray(raw.entries)) return raw.entries;
  return Object.entries(raw).map(([key, value]) => ({ id: key, ...(value as any) }));
}
function mcpToolFrom(raw: any): string | undefined {
  const text = [raw.mcp_tool, raw.notes].filter((value) => typeof value === "string").join(" ");
  const tokens = Array.from(new Set(text.match(/webai_[a-z0-9_]+/g) || []));
  return tokens.length ? tokens.join(", ") : stringValue(raw.mcp_tool);
}

function statusFrom(raw: any): IntegrationRegistryStatus {
  const status = stringValue(raw.status);
  if (!status || !VALID_STATUSES.has(status)) throw new Error(`Invalid integration registry status: ${status || "<missing>"}`);
  return status as IntegrationRegistryStatus;
}

export class CapabilityLibraryImporter {
  constructor(private database = new CapabilityDatabase()) {}

  parseFile(filePath: string): IntegrationRegistryRecord[] {
    const resolved = path.resolve(filePath);
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    return recordsFrom(raw).map((entry: any, index: number) => {
      const feature_id = featureIdFrom(entry, index);
      const service = stringValue(entry.service);
      const name = stringValue(entry.name);
      if (!service) throw new Error(`Integration registry entry ${feature_id} is missing service`);
      if (!name) throw new Error(`Integration registry entry ${feature_id} is missing name`);
      return {
        feature_id,
        service,
        name,
        status: statusFrom(entry),
        mcp_tool: mcpToolFrom(entry),
        raw: entry,
        imported_at: now()
      };
    });
  }

  importFile(filePath: string = path.resolve(process.cwd(), "docs/capability-library.json")): { imported: number; features: string[]; path: string } {
    const entries = this.parseFile(filePath);
    const result = this.database.importIntegrationRegistry(entries);
    return { ...result, path: path.resolve(filePath) };
  }
}
