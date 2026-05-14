import { HealthCheckResult, SnapshotElement } from "../shared/types";

export type TargetKind = "web-ai" | "research-database" | "generic";
export type CapabilityStatus = "active" | "unknown" | "deprecated" | Exclude<HealthCheckResult, "ok">;

export interface BrowserProfileDbRecord {
  id: string;
  profile_name: string;
  browser_type?: string;
  executable_path?: string;
  profile_dir: string;
  cdp_endpoint?: string;
  cdp_port?: number;
  last_status?: string;
  updated_at: string;
}

export interface ServiceTargetRecord {
  target_id: string;
  kind: TargetKind | string;
  base_url?: string;
  display_name?: string;
  metadata?: Record<string, unknown>;
}

export interface PageCaptureRecord {
  id: string;
  target_id: string;
  url: string;
  title: string;
  capture_time: string;
  profile?: string;
  artifact_refs?: string[];
  content_hash?: string;
  metadata?: Record<string, unknown>;
}

export interface UiElementRecord {
  id: string;
  capture_id: string;
  target_id: string;
  ref?: string;
  role: string;
  accessible_name?: string;
  visible_text?: string;
  selector_candidates?: string[];
  bounding_box?: Record<string, unknown>;
  visible?: boolean;
  confidence: number;
  evidence?: Record<string, unknown>;
  source?: SnapshotElement;
}

export interface CapabilityRecord {
  id: string;
  target_id: string;
  category: string;
  name: string;
  description: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  preconditions?: string[];
  selectors?: string[];
  status: CapabilityStatus;
  confidence: number;
  evidence?: Record<string, unknown>;
  updated_at: string;
}

export interface CapabilityVersionRecord {
  id: string;
  capability_id: string;
  target_id: string;
  version: number;
  changed_at: string;
  diff?: Record<string, unknown>;
  record: CapabilityRecord;
}

export interface WorkflowDefinitionRecord {
  id: string;
  target_id?: string;
  profile?: string;
  definition: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  target_id?: string;
  profile?: string;
  mode?: string;
  status: string;
  started_at: string;
  finished_at?: string;
  plan?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface RunEventRecord {
  id: string;
  run_id: string;
  step_id?: string;
  event_type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
  status?: "started" | "succeeded" | "failed" | string;
  started_at?: string;
  finished_at?: string;
  inputs_hash?: string;
  output_artifact_ids?: string[];
  error_code?: string;
  evidence?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface ProfileLeaseRecord {
  id: string;
  profile_id: string;
  run_id?: string;
  owner_pid: number;
  acquired_at: string;
  last_heartbeat_at: string;
  chrome_process_pid?: number;
  user_data_dir: string;
  released_at?: string;
}

export interface ArtifactRecord {
  id: string;
  target_id?: string;
  capture_id?: string | null;
  kind: string;
  path?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface SiteRegistryEntryRecord {
  site_id: string;
  title?: string;
  kind?: string;
  base_url?: string;
  raw: Record<string, unknown>;
  imported_at: string;
}

export interface ScheduledJobRecord {
  id: string;
  target_id: string;
  profile?: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at?: string;
  next_run_at?: string;
  options?: Record<string, unknown>;
}

export interface PolicyEventRecord {
  id: string;
  target_id?: string;
  run_id?: string;
  event_type: string;
  message: string;
  timestamp: string;
  evidence?: Record<string, unknown>;
}

export interface CapabilityDatabaseExport {
  schemaVersion: number;
  exportedAt: string;
  browser_profiles: BrowserProfileDbRecord[];
  service_targets: ServiceTargetRecord[];
  page_captures: PageCaptureRecord[];
  ui_elements: UiElementRecord[];
  capabilities: CapabilityRecord[];
  capability_versions: CapabilityVersionRecord[];
  workflow_definitions: WorkflowDefinitionRecord[];
  workflow_runs: WorkflowRunRecord[];
  run_events: RunEventRecord[];
  profile_leases: ProfileLeaseRecord[];
  artifacts: ArtifactRecord[];
  site_registry_entries: SiteRegistryEntryRecord[];
  scheduled_jobs: ScheduledJobRecord[];
  policy_events: PolicyEventRecord[];
}

export interface CapabilityQuery {
  target?: string;
  text?: string;
  category?: string;
  limit?: number;
}
