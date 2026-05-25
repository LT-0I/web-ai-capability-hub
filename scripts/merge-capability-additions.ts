#!/usr/bin/env node
// Stage 4 merger: read .runs/capability-explore-2026-05-25/<service>/library-additions.jsonl
// from each of chatgpt/claude/gemini, merge into docs/capability-library.json, and extend
// status_enum if new statuses are present.
//
// Idempotent: re-running with same input produces same output.
// Duplicate id detection: if an entry's id already exists in features[], replace with new one
// (overwrite-by-id semantics; the explore is the source of truth for newly added/refreshed cap).
//
// Usage: node scripts/merge-capability-additions.ts

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUN_DIR = path.join(REPO_ROOT, '.runs', 'capability-explore-2026-05-25');
const SERVICES = ['chatgpt', 'claude', 'gemini'];
const LIBRARY_PATH = path.join(REPO_ROOT, 'docs', 'capability-library.json');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && obj.id) out.push(obj);
      else console.error(`  skip non-feature line (no id): ${trimmed.slice(0, 80)}`);
    } catch (e) {
      console.error(`  skip invalid JSON: ${trimmed.slice(0, 80)} (${e.message})`);
    }
  }
  return out;
}

const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
const beforeCount = library.features.length;
const featuresById = new Map(library.features.map((f) => [f.id, f]));
const knownStatuses = new Set(library.status_enum);

let mergedAdditions = 0;
let overwrites = 0;
const newStatuses = [];

for (const service of SERVICES) {
  const jsonlPath = path.join(RUN_DIR, service, 'library-additions.jsonl');
  const entries = readJsonl(jsonlPath);
  console.log(`${service}: ${entries.length} entries from ${jsonlPath}`);
  for (const entry of entries) {
    if (!entry.status || typeof entry.status !== 'string') {
      console.error(`  skip ${entry.id}: missing status`);
      continue;
    }
    if (!knownStatuses.has(entry.status)) {
      knownStatuses.add(entry.status);
      newStatuses.push(entry.status);
    }
    if (featuresById.has(entry.id)) overwrites += 1;
    else mergedAdditions += 1;
    featuresById.set(entry.id, entry);
  }
}

const mergedFeatures = Array.from(featuresById.values()).sort((a, b) => {
  if (a.service !== b.service) return String(a.service).localeCompare(String(b.service));
  return String(a.id).localeCompare(String(b.id));
});

const updated = {
  ...library,
  status_enum: Array.from(knownStatuses).sort(),
  generated: new Date().toISOString().slice(0, 10),
  features: mergedFeatures
};

fs.writeFileSync(LIBRARY_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf8');

console.log('---');
console.log(`library before: ${beforeCount} features`);
console.log(`library after: ${mergedFeatures.length} features (additions: ${mergedAdditions}, overwrites: ${overwrites})`);
if (newStatuses.length) console.log(`new status_enum values added: ${newStatuses.join(', ')}`);
console.log(`wrote: ${LIBRARY_PATH}`);
