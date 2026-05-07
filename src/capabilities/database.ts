const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
import { ensureDir, getStoragePaths } from "../utils/paths";
import { optionalRequire } from "../utils/optionalRequire";
import { CAPABILITY_DB_SCHEMA_VERSION, SQLITE_MIGRATIONS } from "./migrations";
import {
  ArtifactRecord,
  BrowserProfileDbRecord,
  CapabilityDatabaseExport,
  CapabilityQuery,
  CapabilityRecord,
  CapabilityVersionRecord,
  PageCaptureRecord,
  PolicyEventRecord,
  RunEventRecord,
  ScheduledJobRecord,
  ServiceTargetRecord,
  SiteRegistryEntryRecord,
  UiElementRecord,
  WorkflowDefinitionRecord,
  WorkflowRunRecord
} from "./schemas";

export interface CapabilityDatabaseOptions {
  dbPath?: string;
  preferSqlite?: boolean;
}

type TableName = keyof Omit<CapabilityDatabaseExport, "schemaVersion" | "exportedAt">;

type StoreData = Omit<CapabilityDatabaseExport, "exportedAt">;

const TABLES: TableName[] = [
  "browser_profiles",
  "service_targets",
  "page_captures",
  "ui_elements",
  "capabilities",
  "capability_versions",
  "workflow_definitions",
  "workflow_runs",
  "run_events",
  "artifacts",
  "site_registry_entries",
  "scheduled_jobs",
  "policy_events"
];

function now(): string { return new Date().toISOString(); }
function id(prefix: string): string { return `${prefix}_${crypto.randomBytes(8).toString("hex")}`; }
function stableId(prefix: string, value: string): string { return `${prefix}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 16)}`; }
function artifactId(targetId: string, kind: string, artifactPath: string): string { return `art_${crypto.createHash("sha1").update(`${targetId}:${kind}:${artifactPath}`).digest("hex")}`; }
function json<T>(value: T | undefined): string | null { return value === undefined ? null : JSON.stringify(value); }
function parseJson<T>(value: string | null | undefined, fallback: T): T { if (!value) return fallback; try { return JSON.parse(value); } catch { return fallback; } }
function textForCapability(capability: CapabilityRecord): string { return [capability.name, capability.category, capability.description, JSON.stringify(capability.inputs || {}), JSON.stringify(capability.outputs || {}), JSON.stringify(capability.evidence || {})].join(" "); }

function emptyStore(): StoreData {
  return {
    schemaVersion: CAPABILITY_DB_SCHEMA_VERSION,
    browser_profiles: [],
    service_targets: [],
    page_captures: [],
    ui_elements: [],
    capabilities: [],
    capability_versions: [],
    workflow_definitions: [],
    workflow_runs: [],
    run_events: [],
    artifacts: [],
    site_registry_entries: [],
    scheduled_jobs: [],
    policy_events: []
  };
}

export class CapabilityDatabase {
  readonly dbPath: string;
  private sqlite: any;
  private sqliteAvailable = false;

  constructor(options: CapabilityDatabaseOptions = {}) {
    const storage = getStoragePaths();
    this.dbPath = path.resolve(options.dbPath || process.env.WAH_SQLITE_PATH || path.join(storage.dataDir, "capability-hub.sqlite"));
    const Database = options.preferSqlite === false ? undefined : optionalRequire<any>("better-sqlite3");
    if (Database) {
      ensureDir(path.dirname(this.dbPath));
      this.sqlite = new Database(this.dbPath);
      this.sqliteAvailable = true;
    }
  }

  init(): { ok: true; path: string; driver: string; schemaVersion: number; tables: TableName[] } {
    ensureDir(path.dirname(this.dbPath));
    if (this.sqliteAvailable) {
      for (const migration of SQLITE_MIGRATIONS) this.sqlite.exec(migration);
    } else if (!fs.existsSync(this.dbPath)) {
      this.writeStore(emptyStore());
    } else {
      const store = this.readStore();
      this.writeStore({ ...emptyStore(), ...store, schemaVersion: CAPABILITY_DB_SCHEMA_VERSION });
    }
    return { ok: true, path: this.dbPath, driver: this.sqliteAvailable ? "better-sqlite3" : "json-fallback", schemaVersion: CAPABILITY_DB_SCHEMA_VERSION, tables: TABLES };
  }

  driver(): string { return this.sqliteAvailable ? "better-sqlite3" : "json-fallback"; }

  upsertServiceTarget(record: ServiceTargetRecord): ServiceTargetRecord {
    this.init();
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`INSERT INTO service_targets (target_id, kind, base_url, display_name, metadata) VALUES (?, ?, ?, ?, ?) ON CONFLICT(target_id) DO UPDATE SET kind=excluded.kind, base_url=excluded.base_url, display_name=excluded.display_name, metadata=excluded.metadata`).run(record.target_id, record.kind, record.base_url || null, record.display_name || null, json(record.metadata));
    } else {
      this.upsertJson("service_targets", record, (row) => row.target_id === record.target_id);
    }
    return record;
  }

  insertBrowserProfile(record: Omit<BrowserProfileDbRecord, "id" | "updated_at"> & { id?: string; updated_at?: string }): BrowserProfileDbRecord {
    this.init();
    const row: BrowserProfileDbRecord = { id: record.id || stableId("profile", record.profile_name), updated_at: record.updated_at || now(), ...record };
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`INSERT INTO browser_profiles (id, profile_name, browser_type, executable_path, profile_dir, cdp_endpoint, cdp_port, last_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile_name) DO UPDATE SET browser_type=excluded.browser_type, executable_path=excluded.executable_path, profile_dir=excluded.profile_dir, cdp_endpoint=excluded.cdp_endpoint, cdp_port=excluded.cdp_port, last_status=excluded.last_status, updated_at=excluded.updated_at`).run(row.id, row.profile_name, row.browser_type || null, row.executable_path || null, row.profile_dir, row.cdp_endpoint || null, row.cdp_port || null, row.last_status || null, row.updated_at);
    } else {
      this.upsertJson("browser_profiles", row, (x) => x.profile_name === row.profile_name);
    }
    return row;
  }

  insertPageCapture(record: Omit<PageCaptureRecord, "id" | "capture_time"> & { id?: string; capture_time?: string }): PageCaptureRecord {
    this.init();
    const row: PageCaptureRecord = { id: record.id || id("capture"), capture_time: record.capture_time || now(), ...record };
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`INSERT INTO page_captures (id, target_id, url, title, capture_time, profile, artifact_refs, content_hash, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.target_id, row.url, row.title, row.capture_time, row.profile || null, json(row.artifact_refs || []), row.content_hash || null, json(row.metadata));
    } else {
      this.pushJson("page_captures", row);
    }
    return row;
  }

  updatePageCaptureArtifactRefs(captureId: string, artifactRefs: string[]): void {
    this.init();
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`UPDATE page_captures SET artifact_refs=? WHERE id=?`).run(json(artifactRefs), captureId);
    } else {
      const store = this.readStore();
      const capture = store.page_captures.find((row) => row.id === captureId);
      if (capture) {
        capture.artifact_refs = artifactRefs;
        this.writeStore(store);
      }
    }
  }

  insertArtifact(record: {
    id?: string;
    target_id: string;
    capture_id: string | null;
    kind: string;
    path: string;
    created_at?: string;
    metadata?: Record<string, unknown>;
  }): ArtifactRecord {
    this.init();
    const row: ArtifactRecord = {
      id: artifactId(record.target_id, record.kind, record.path),
      target_id: record.target_id,
      capture_id: record.capture_id,
      kind: record.kind,
      path: record.path,
      created_at: record.created_at || now(),
      metadata: record.metadata
    };
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`INSERT OR REPLACE INTO artifacts (id, target_id, capture_id, kind, path, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.target_id || null, row.capture_id || null, row.kind, row.path || null, row.created_at, json(row.metadata));
    } else {
      this.upsertJson("artifacts", row, (existing) => existing.id === row.id);
    }
    return row;
  }

  insertUiElements(records: UiElementRecord[]): UiElementRecord[] {
    this.init();
    if (!records.length) return [];
    if (this.sqliteAvailable) {
      const stmt = this.sqlite.prepare(`INSERT OR REPLACE INTO ui_elements (id, capture_id, target_id, ref, role, accessible_name, visible_text, selector_candidates, bounding_box, visible, confidence, evidence, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const tx = this.sqlite.transaction((rows: UiElementRecord[]) => {
        for (const row of rows) stmt.run(row.id, row.capture_id, row.target_id, row.ref || null, row.role, row.accessible_name || null, row.visible_text || null, json(row.selector_candidates || []), json(row.bounding_box), row.visible === undefined ? null : row.visible ? 1 : 0, row.confidence, json(row.evidence), json(row.source));
      });
      tx(records);
    } else {
      const store = this.readStore();
      store.ui_elements.push(...records);
      this.writeStore(store);
    }
    return records;
  }

  upsertCapabilities(records: CapabilityRecord[]): CapabilityRecord[] {
    this.init();
    const rows = records.map((record) => ({ ...record, updated_at: record.updated_at || now() }));
    if (this.sqliteAvailable) {
      const existingStmt = this.sqlite.prepare(`SELECT * FROM capabilities WHERE target_id=? AND name=?`);
      const stmt = this.sqlite.prepare(`INSERT INTO capabilities (id, target_id, category, name, description, inputs, outputs, preconditions, selectors, status, confidence, evidence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_id, name) DO UPDATE SET category=excluded.category, description=excluded.description, inputs=excluded.inputs, outputs=excluded.outputs, preconditions=excluded.preconditions, selectors=excluded.selectors, status=excluded.status, confidence=excluded.confidence, evidence=excluded.evidence, updated_at=excluded.updated_at`);
      const ftsDelete = this.sqlite.prepare(`DELETE FROM capabilities_fts WHERE id=?`);
      const ftsInsert = this.sqlite.prepare(`INSERT INTO capabilities_fts (id, target_id, text) VALUES (?, ?, ?)`);
      const tx = this.sqlite.transaction((capabilities: CapabilityRecord[]) => {
        for (const row of capabilities) {
          const existing = existingStmt.get(row.target_id, row.name);
          stmt.run(row.id, row.target_id, row.category, row.name, row.description, json(row.inputs), json(row.outputs), json(row.preconditions || []), json(row.selectors || []), row.status, row.confidence, json(row.evidence), row.updated_at);
          ftsDelete.run(row.id);
          ftsInsert.run(row.id, row.target_id, textForCapability(row));
          if (existing) this.insertCapabilityVersion(row, diffCapability(this.sqliteRowToCapability(existing), row));
          else this.insertCapabilityVersion(row, { created: true });
        }
      });
      tx(rows);
    } else {
      const store = this.readStore();
      for (const row of rows) {
        const existingIndex = store.capabilities.findIndex((capability) => capability.target_id === row.target_id && capability.name === row.name);
        if (existingIndex >= 0) {
          const previous = store.capabilities[existingIndex];
          store.capabilities[existingIndex] = row;
          store.capability_versions.push(makeVersion(row, nextVersion(store.capability_versions, row.id), diffCapability(previous, row)));
        } else {
          store.capabilities.push(row);
          store.capability_versions.push(makeVersion(row, 1, { created: true }));
        }
      }
      this.writeStore(store);
    }
    return rows;
  }

  queryCapabilities(query: CapabilityQuery): CapabilityRecord[] {
    this.init();
    const limit = query.limit || 20;
    const text = (query.text || "").toLowerCase();
    if (this.sqliteAvailable) {
      let rows: any[];
      if (text) {
        const like = `%${text.replace(/[%_]/g, "")}%`;
        rows = this.sqlite.prepare(`SELECT * FROM capabilities WHERE (? IS NULL OR target_id=?) AND (? IS NULL OR category=?) AND (lower(name || ' ' || description || ' ' || category || ' ' || coalesce(evidence,'')) LIKE ?) ORDER BY confidence DESC, updated_at DESC LIMIT ?`)
          .all(query.target || null, query.target || null, query.category || null, query.category || null, like, limit);
      } else {
        rows = this.sqlite.prepare(`SELECT * FROM capabilities WHERE (? IS NULL OR target_id=?) AND (? IS NULL OR category=?) ORDER BY confidence DESC, updated_at DESC LIMIT ?`)
          .all(query.target || null, query.target || null, query.category || null, query.category || null, limit);
      }
      return rows.map((row) => this.sqliteRowToCapability(row));
    }
    return this.readStore().capabilities
      .filter((capability) => !query.target || capability.target_id === query.target)
      .filter((capability) => !query.category || capability.category === query.category)
      .filter((capability) => !text || textForCapability(capability).toLowerCase().includes(text))
      .sort((a, b) => b.confidence - a.confidence || b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
  }

  getCapabilityByName(targetId: string, name: string): CapabilityRecord | undefined {
    return this.queryCapabilities({ target: targetId, text: name, limit: 50 }).find((capability) => capability.name === name);
  }

  latestCapture(targetId: string): PageCaptureRecord | undefined {
    if (this.sqliteAvailable) {
      const row = this.sqlite.prepare(`SELECT * FROM page_captures WHERE target_id=? ORDER BY capture_time DESC LIMIT 1`).get(targetId);
      if (!row) return undefined;
      return { ...row, artifact_refs: parseJson(row.artifact_refs, []), metadata: parseJson(row.metadata, {}) };
    }
    return this.readStore().page_captures.filter((capture) => capture.target_id === targetId).sort((a, b) => b.capture_time.localeCompare(a.capture_time))[0];
  }

  listTargets(): ServiceTargetRecord[] {
    this.init();
    if (this.sqliteAvailable) return this.sqlite.prepare(`SELECT * FROM service_targets ORDER BY target_id`).all().map((row: any) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
    return [...this.readStore().service_targets].sort((a, b) => a.target_id.localeCompare(b.target_id));
  }

  importSiteRegistry(entries: SiteRegistryEntryRecord[]): { imported: number; sites: string[] } {
    this.init();
    if (this.sqliteAvailable) {
      const stmt = this.sqlite.prepare(`INSERT INTO site_registry_entries (site_id, title, kind, base_url, raw, imported_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(site_id) DO UPDATE SET title=excluded.title, kind=excluded.kind, base_url=excluded.base_url, raw=excluded.raw, imported_at=excluded.imported_at`);
      const targetStmt = this.sqlite.prepare(`INSERT INTO service_targets (target_id, kind, base_url, display_name, metadata) VALUES (?, ?, ?, ?, ?) ON CONFLICT(target_id) DO UPDATE SET kind=excluded.kind, base_url=excluded.base_url, display_name=excluded.display_name, metadata=excluded.metadata`);
      const tx = this.sqlite.transaction((rows: SiteRegistryEntryRecord[]) => {
        for (const row of rows) {
          stmt.run(row.site_id, row.title || null, row.kind || "research-database", row.base_url || null, json(row.raw), row.imported_at);
          targetStmt.run(row.site_id, "research-database", row.base_url || null, row.title || row.site_id, json({ registry: row.raw }));
        }
      });
      tx(entries);
    } else {
      const store = this.readStore();
      for (const entry of entries) {
        const index = store.site_registry_entries.findIndex((row) => row.site_id === entry.site_id);
        if (index >= 0) store.site_registry_entries[index] = entry; else store.site_registry_entries.push(entry);
        const target: ServiceTargetRecord = { target_id: entry.site_id, kind: "research-database", base_url: entry.base_url, display_name: entry.title || entry.site_id, metadata: { registry: entry.raw } };
        const targetIndex = store.service_targets.findIndex((row) => row.target_id === target.target_id);
        if (targetIndex >= 0) store.service_targets[targetIndex] = target; else store.service_targets.push(target);
      }
      this.writeStore(store);
    }
    return { imported: entries.length, sites: entries.map((entry) => entry.site_id) };
  }

  addWorkflowDefinition(record: WorkflowDefinitionRecord): WorkflowDefinitionRecord {
    this.init();
    if (this.sqliteAvailable) {
      this.sqlite.prepare(`INSERT INTO workflow_definitions (id, target_id, profile, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET target_id=excluded.target_id, profile=excluded.profile, definition=excluded.definition, updated_at=excluded.updated_at`)
        .run(record.id, record.target_id || null, record.profile || null, json(record.definition), record.created_at, record.updated_at);
    } else this.upsertJson("workflow_definitions", record, (row) => row.id === record.id);
    return record;
  }

  addWorkflowRun(record: WorkflowRunRecord): WorkflowRunRecord {
    this.init();
    if (this.sqliteAvailable) this.sqlite.prepare(`INSERT INTO workflow_runs (id, workflow_id, target_id, profile, mode, status, started_at, finished_at, plan, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.workflow_id, record.target_id || null, record.profile || null, record.mode || null, record.status, record.started_at, record.finished_at || null, json(record.plan), json(record.result));
    else this.pushJson("workflow_runs", record);
    return record;
  }

  addRunEvent(record: RunEventRecord): RunEventRecord {
    this.init();
    if (this.sqliteAvailable) this.sqlite.prepare(`INSERT INTO run_events (id, run_id, step_id, event_type, timestamp, payload) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.run_id, record.step_id || null, record.event_type, record.timestamp, json(record.payload));
    else this.pushJson("run_events", record);
    return record;
  }

  addPolicyEvent(record: Omit<PolicyEventRecord, "id" | "timestamp"> & { id?: string; timestamp?: string }): PolicyEventRecord {
    const row: PolicyEventRecord = { id: record.id || id("policy"), timestamp: record.timestamp || now(), ...record };
    this.init();
    if (this.sqliteAvailable) this.sqlite.prepare(`INSERT INTO policy_events (id, target_id, run_id, event_type, message, timestamp, evidence) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(row.id, row.target_id || null, row.run_id || null, row.event_type, row.message, row.timestamp, json(row.evidence));
    else this.pushJson("policy_events", row);
    return row;
  }

  exportJson(target?: string): CapabilityDatabaseExport {
    this.init();
    if (!this.sqliteAvailable) {
      const data = this.readStore();
      const filtered = target ? filterExportByTarget(data, target) : data;
      return { ...filtered, exportedAt: now() };
    }
    const out: any = { schemaVersion: CAPABILITY_DB_SCHEMA_VERSION, exportedAt: now() };
    for (const table of TABLES) out[table] = this.sqlite.prepare(`SELECT * FROM ${table}`).all();
    out.service_targets = out.service_targets.map((row: any) => ({ ...row, metadata: parseJson(row.metadata, {}) }));
    out.page_captures = out.page_captures.map((row: any) => ({ ...row, artifact_refs: parseJson(row.artifact_refs, []), metadata: parseJson(row.metadata, {}) }));
    out.ui_elements = out.ui_elements.map((row: any) => ({ ...row, selector_candidates: parseJson(row.selector_candidates, []), bounding_box: parseJson(row.bounding_box, undefined), visible: row.visible === null ? undefined : !!row.visible, evidence: parseJson(row.evidence, {}), source: parseJson(row.source, undefined) }));
    out.capabilities = out.capabilities.map((row: any) => this.sqliteRowToCapability(row));
    out.capability_versions = out.capability_versions.map((row: any) => ({ ...row, diff: parseJson(row.diff, {}), record: parseJson(row.record, {}) }));
    out.workflow_definitions = out.workflow_definitions.map((row: any) => ({ ...row, definition: parseJson(row.definition, {}) }));
    out.workflow_runs = out.workflow_runs.map((row: any) => ({ ...row, plan: parseJson(row.plan, undefined), result: parseJson(row.result, undefined) }));
    out.run_events = out.run_events.map((row: any) => ({ ...row, payload: parseJson(row.payload, undefined) }));
    out.artifacts = out.artifacts.map((row: any) => ({ ...row, metadata: parseJson(row.metadata, undefined) }));
    out.site_registry_entries = out.site_registry_entries.map((row: any) => ({ ...row, raw: parseJson(row.raw, {}) }));
    out.scheduled_jobs = out.scheduled_jobs.map((row: any) => ({ ...row, enabled: !!row.enabled, options: parseJson(row.options, undefined) }));
    out.policy_events = out.policy_events.map((row: any) => ({ ...row, evidence: parseJson(row.evidence, undefined) }));
    return target ? { ...filterExportByTarget(out, target), exportedAt: out.exportedAt } : out;
  }

  importJson(data: Partial<CapabilityDatabaseExport>): { imported: Record<string, number> } {
    this.init();
    const imported: Record<string, number> = {};
    if (this.sqliteAvailable) {
      // Simpler, deterministic import path: merge through JSON fallback representation then reinsert key supported tables.
      const merged = { ...emptyStore(), ...data } as StoreData;
      if (merged.service_targets) for (const row of merged.service_targets) this.upsertServiceTarget(row);
      if (merged.capabilities) this.upsertCapabilities(merged.capabilities);
      imported.service_targets = merged.service_targets?.length || 0;
      imported.capabilities = merged.capabilities?.length || 0;
      return { imported };
    }
    const store = this.readStore();
    for (const table of TABLES) {
      const rows = (data as any)[table];
      if (Array.isArray(rows)) {
        (store as any)[table] = rows;
        imported[table] = rows.length;
      }
    }
    this.writeStore(store);
    return { imported };
  }

  close(): void { this.sqlite?.close?.(); }

  static id(prefix: string): string { return id(prefix); }
  static stableId(prefix: string, value: string): string { return stableId(prefix, value); }
  static artifactId(targetId: string, kind: string, artifactPath: string): string { return artifactId(targetId, kind, artifactPath); }

  private readStore(): StoreData {
    if (!fs.existsSync(this.dbPath)) return emptyStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dbPath, "utf-8"));
      return { ...emptyStore(), ...parsed, schemaVersion: parsed.schemaVersion || CAPABILITY_DB_SCHEMA_VERSION };
    } catch {
      return emptyStore();
    }
  }

  private writeStore(store: StoreData): void {
    ensureDir(path.dirname(this.dbPath));
    fs.writeFileSync(this.dbPath, JSON.stringify({ ...store, schemaVersion: CAPABILITY_DB_SCHEMA_VERSION }, null, 2), "utf-8");
  }

  private pushJson<T>(table: TableName, row: T): void {
    const store = this.readStore();
    (store as any)[table].push(row);
    this.writeStore(store);
  }

  private upsertJson<T>(table: TableName, row: T, predicate: (row: any) => boolean): void {
    const store = this.readStore();
    const rows = (store as any)[table] as T[];
    const index = rows.findIndex(predicate);
    if (index >= 0) rows[index] = row; else rows.push(row);
    this.writeStore(store);
  }

  private insertCapabilityVersion(row: CapabilityRecord, diff: Record<string, unknown>): void {
    const latest = this.sqlite.prepare(`SELECT max(version) as version FROM capability_versions WHERE capability_id=?`).get(row.id);
    const version = Number(latest?.version || 0) + 1;
    const record = makeVersion(row, version, diff);
    this.sqlite.prepare(`INSERT INTO capability_versions (id, capability_id, target_id, version, changed_at, diff, record) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(record.id, record.capability_id, record.target_id, record.version, record.changed_at, json(record.diff), json(record.record));
  }

  private sqliteRowToCapability(row: any): CapabilityRecord {
    return {
      id: row.id,
      target_id: row.target_id,
      category: row.category,
      name: row.name,
      description: row.description,
      inputs: parseJson(row.inputs, undefined),
      outputs: parseJson(row.outputs, undefined),
      preconditions: parseJson(row.preconditions, []),
      selectors: parseJson(row.selectors, []),
      status: row.status,
      confidence: Number(row.confidence),
      evidence: parseJson(row.evidence, undefined),
      updated_at: row.updated_at
    };
  }
}

function makeVersion(row: CapabilityRecord, version: number, diff: Record<string, unknown>): CapabilityVersionRecord {
  return { id: id("capver"), capability_id: row.id, target_id: row.target_id, version, changed_at: now(), diff, record: row };
}

function nextVersion(versions: CapabilityVersionRecord[], capabilityId: string): number {
  return versions.filter((version) => version.capability_id === capabilityId).reduce((max, version) => Math.max(max, version.version), 0) + 1;
}

export function hashContent(value: unknown): string {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function diffCapability(previous: CapabilityRecord, current: CapabilityRecord): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of ["category", "description", "status", "confidence"] as const) {
    if ((previous as any)[key] !== (current as any)[key]) diff[key] = { before: (previous as any)[key], after: (current as any)[key] };
  }
  if (JSON.stringify(previous.selectors || []) !== JSON.stringify(current.selectors || [])) diff.selectors = { before: previous.selectors || [], after: current.selectors || [] };
  if (JSON.stringify(previous.evidence || {}) !== JSON.stringify(current.evidence || {})) diff.evidenceChanged = true;
  return diff;
}

function filterExportByTarget(data: StoreData, target: string): StoreData {
  return {
    ...data,
    service_targets: data.service_targets.filter((row) => row.target_id === target),
    page_captures: data.page_captures.filter((row) => row.target_id === target),
    ui_elements: data.ui_elements.filter((row) => row.target_id === target),
    capabilities: data.capabilities.filter((row) => row.target_id === target),
    capability_versions: data.capability_versions.filter((row) => row.target_id === target),
    artifacts: data.artifacts.filter((row) => row.target_id === target),
    scheduled_jobs: data.scheduled_jobs.filter((row) => row.target_id === target),
    policy_events: data.policy_events.filter((row) => row.target_id === target),
    site_registry_entries: data.site_registry_entries.filter((row) => row.site_id === target)
  };
}

export function defaultCapabilityDatabase(): CapabilityDatabase {
  return new CapabilityDatabase();
}
