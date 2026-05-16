const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../../capabilities/database";
import { SiteRegistryEntryRecord } from "../../capabilities/schemas";

const REDACTED_INSTITUTIONAL_URL = "[REDACTED_INSTITUTIONAL_URL]";

function now(): string { return new Date().toISOString(); }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function siteIdFrom(raw: any, index: number): string {
  return stringValue(raw.id) || stringValue(raw.site_id) || stringValue(raw.key) || stringValue(raw.slug) || stringValue(raw.name)?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `site-${index + 1}`;
}
function baseUrlFrom(raw: any): string | undefined {
  return stringValue(raw.base_url) || stringValue(raw.url) || stringValue(raw.home_url) || stringValue(raw.search_url) || stringValue(raw.entry_url);
}
function titleFrom(raw: any, siteId: string): string | undefined {
  return stringValue(raw.title) || stringValue(raw.name) || stringValue(raw.display_name) || siteId;
}
function isNuaaStemSeed(raw: any): boolean {
  return typeof raw?.schema_version === "string" && raw.schema_version.startsWith("nuaa-stem-deep-explore") && Array.isArray(raw.records);
}
function shouldRedactInstitutionalString(value: string, key?: string): boolean {
  if (/(^|[\s/:@.-])(?:[a-z0-9-]+\.)*nuaa\.edu\.cn\b/i.test(value)) return true;
  if (/libproxy/i.test(value)) return true;
  if (key && /^(nav_url|proxy_url|direct_url)$/i.test(key) && /^https?:\/\//i.test(value.trim())) return true;
  return false;
}
export function normalizeInstitutionalUrls(value: unknown, key?: string): any {
  if (typeof value === "string") return shouldRedactInstitutionalString(value, key) ? REDACTED_INSTITUTIONAL_URL : value;
  if (Array.isArray(value)) return value.map((item) => normalizeInstitutionalUrls(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, normalizeInstitutionalUrls(entryValue, entryKey)]));
  }
  return value;
}
function nuaaEntryFrom(record: any, schemaVersion: string): Omit<SiteRegistryEntryRecord, "imported_at"> {
  return {
    site_id: `nuaa-stem-${record.resource_id}`,
    title: record.title,
    kind: "research-database",
    base_url: undefined,
    raw: {
      ...record,
      classification: {
        science_engineering: record.science_engineering,
        subject: record.subject,
        matched_subjects: record.matched_subjects,
        has_external_url: record.has_external_url,
        nav_entry_id: record.nav_entry_id,
        source: schemaVersion
      }
    }
  };
}

export class SiteRegistryImporter {
  constructor(private database = new CapabilityDatabase()) {}

  parseFile(filePath: string): SiteRegistryEntryRecord[] {
    const resolved = path.resolve(filePath);
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    if (isNuaaStemSeed(raw)) {
      return raw.records.map((record: any) => {
        const entry = nuaaEntryFrom(record, raw.schema_version);
        return { ...entry, raw: normalizeInstitutionalUrls(entry.raw), imported_at: now() };
      });
    }
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw.sites) ? raw.sites : Array.isArray(raw.entries) ? raw.entries : Object.entries(raw).map(([key, value]) => ({ id: key, ...(value as any) }));
    return rows.map((entry: any, index: number) => {
      const site_id = siteIdFrom(entry, index);
      return { site_id, title: titleFrom(entry, site_id), kind: stringValue(entry.kind) || "research-database", base_url: baseUrlFrom(entry), raw: normalizeInstitutionalUrls(entry), imported_at: now() };
    });
  }

  importFile(filePath: string): { imported: number; sites: string[]; path: string } {
    const entries = this.parseFile(filePath);
    const result = this.database.importSiteRegistry(entries);
    return { ...result, path: path.resolve(filePath) };
  }
}
