CREATE TABLE IF NOT EXISTS profile_leases (
  lease_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, run_id TEXT NOT NULL,
  acquired_at TEXT, ttl_seconds INTEGER, last_heartbeat_at TEXT,
  pid INTEGER, cdp_endpoint TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS tab_leases (
  lease_id TEXT PRIMARY KEY, profile_lease_id TEXT, url_match TEXT,
  acquired_at TEXT, ttl_seconds INTEGER, last_heartbeat_at TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS element_bank (
  id TEXT PRIMARY KEY, manifest_id TEXT, selector_role TEXT, target TEXT,
  state_hash TEXT, primary_css TEXT, primary_xpath TEXT,
  aria_role TEXT, aria_name TEXT, near_text_json TEXT, bbox_json TEXT,
  dom_fingerprint TEXT, last_success_at TEXT, last_failure_at TEXT,
  success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS drift_events (
  run_id TEXT, manifest_id TEXT, selector_role TEXT,
  resolution_step INTEGER, confidence REAL, component_scores_json TEXT,
  ts TEXT
);
CREATE TABLE IF NOT EXISTS cancel_requests (
  run_id TEXT PRIMARY KEY, requested_at TEXT, reason TEXT
);
