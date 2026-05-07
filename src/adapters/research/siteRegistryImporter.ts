const fs = require("node:fs");
const path = require("node:path");
import { CapabilityDatabase } from "../../capabilities/database";
import { SiteRegistryEntryRecord } from "../../capabilities/schemas";

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

export class SiteRegistryImporter {
  constructor(private database = new CapabilityDatabase()) {}

  parseFile(filePath: string): SiteRegistryEntryRecord[] {
    const resolved = path.resolve(filePath);
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw.sites) ? raw.sites : Array.isArray(raw.entries) ? raw.entries : Object.entries(raw).map(([key, value]) => ({ id: key, ...(value as any) }));
    return rows.map((entry: any, index: number) => {
      const site_id = siteIdFrom(entry, index);
      return { site_id, title: titleFrom(entry, site_id), kind: stringValue(entry.kind) || "research-database", base_url: baseUrlFrom(entry), raw: entry, imported_at: now() };
    });
  }

  importFile(filePath: string): { imported: number; sites: string[]; path: string } {
    const entries = this.parseFile(filePath);
    const result = this.database.importSiteRegistry(entries);
    return { ...result, path: path.resolve(filePath) };
  }
}
