export const CAPABILITY_DB_SCHEMA_VERSION = 1;

export const SQLITE_MIGRATIONS = [
`CREATE TABLE IF NOT EXISTS browser_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT UNIQUE NOT NULL,
  browser_type TEXT,
  executable_path TEXT,
  profile_dir TEXT NOT NULL,
  cdp_endpoint TEXT,
  cdp_port INTEGER,
  last_status TEXT,
  updated_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS service_targets (
  target_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  base_url TEXT,
  display_name TEXT,
  metadata TEXT
);`,
`CREATE TABLE IF NOT EXISTS page_captures (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  capture_time TEXT NOT NULL,
  profile TEXT,
  artifact_refs TEXT,
  content_hash TEXT,
  metadata TEXT
);`,
`CREATE TABLE IF NOT EXISTS ui_elements (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  ref TEXT,
  role TEXT NOT NULL,
  accessible_name TEXT,
  visible_text TEXT,
  selector_candidates TEXT,
  bounding_box TEXT,
  visible INTEGER,
  confidence REAL NOT NULL,
  evidence TEXT,
  source TEXT
);`,
`CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  inputs TEXT,
  outputs TEXT,
  preconditions TEXT,
  selectors TEXT,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(target_id, name)
);`,
`CREATE TABLE IF NOT EXISTS capability_versions (
  id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  diff TEXT,
  record TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  target_id TEXT,
  profile TEXT,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  target_id TEXT,
  profile TEXT,
  mode TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  plan TEXT,
  result TEXT
);`,
`CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload TEXT
);`,
`CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  target_id TEXT,
  capture_id TEXT,
  kind TEXT NOT NULL,
  path TEXT,
  created_at TEXT NOT NULL,
  metadata TEXT
);`,
`CREATE TABLE IF NOT EXISTS site_registry_entries (
  site_id TEXT PRIMARY KEY,
  title TEXT,
  kind TEXT,
  base_url TEXT,
  raw TEXT NOT NULL,
  imported_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  profile TEXT,
  enabled INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT,
  options TEXT
);`,
`CREATE TABLE IF NOT EXISTS policy_events (
  id TEXT PRIMARY KEY,
  target_id TEXT,
  run_id TEXT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  evidence TEXT
);`,
`CREATE VIRTUAL TABLE IF NOT EXISTS capabilities_fts USING fts5(id, target_id, text);`
];
