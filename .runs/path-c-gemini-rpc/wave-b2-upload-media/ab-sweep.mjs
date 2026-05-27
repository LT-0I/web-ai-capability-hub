#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const outDir = path.join(root, '.runs/path-c-gemini-rpc/wave-b2-upload-media');
const downloadsDir = path.join(outDir, 'downloads');
const fixtureDir = path.join(outDir, 'tmp-fixtures');
const resultsPath = path.join(outDir, 'ab-sweep-results.json');
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

const tools = require(path.join(root, 'dist/src/mcp/tools.js'));
const GEMINI_PROFILE = 'gemini-9225';
const PACE_MS = Number(process.env.WEBAI_GEMINI_AB_PACE_MS || 30000);
const startedAt = new Date().toISOString();
let lastCallAt = 0;
let stopReason = null;
const results = [];
const fixtureFiles = [];

function writeJson() {
  fs.writeFileSync(resultsPath, JSON.stringify({
    ok: !stopReason,
    stopReason,
    profile: GEMINI_PROFILE,
    pace_ms: PACE_MS,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    results
  }, null, 2));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function pace() {
  const delta = Date.now() - lastCallAt;
  if (lastCallAt && delta < PACE_MS) await sleep(PACE_MS - delta);
  lastCallAt = Date.now();
}

function fixture(name, content) {
  const file = path.join(fixtureDir, name);
  fs.writeFileSync(file, content, 'utf8');
  fixtureFiles.push(file);
  return file;
}

function artifactInfo(result) {
  const candidate = result && (result.path || result.savedPath);
  const exists = Boolean(candidate && fs.existsSync(candidate));
  return {
    path: candidate || '',
    exists,
    size_bytes: exists ? fs.statSync(candidate).size : Number(result?.size_bytes || result?.byteSize || 0),
    sha256_present: Boolean(result?.sha256)
  };
}

function textLength(result) {
  return String(result?.response_text || result?.message || '').length;
}

function accountRisk(result, error) {
  const blob = `${result?.errorCode || ''} ${result?.error_code || ''} ${result?.message || ''} ${error?.message || error || ''}`;
  return /PLAN_OR_QUOTA_REQUIRED|429|quota|lockout|rate.?limit|too many requests/i.test(blob);
}

async function callVariant(variant, backend) {
  await pace();
  const envKey = variant.env;
  const previous = process.env[envKey];
  process.env[envKey] = backend;
  const callStarted = Date.now();
  let result = null;
  let thrown = null;
  try {
    result = await variant.call();
  } catch (error) {
    thrown = { message: error?.message || String(error), errorCode: error?.errorCode || error?.code || null };
  } finally {
    if (previous === undefined) delete process.env[envKey];
    else process.env[envKey] = previous;
  }
  const elapsedMs = Date.now() - callStarted;
  const artifact = artifactInfo(result || {});
  const record = {
    variant: variant.name,
    backend,
    elapsed_ms: elapsedMs,
    ok: !thrown && !result?.errorCode && !result?.error_code,
    errorCode: result?.errorCode || result?.error_code || thrown?.errorCode || null,
    message: result?.message || thrown?.message || '',
    response_text_length: textLength(result || {}),
    completion_detected: Boolean(result?.completion_detected),
    artifact,
    raw_shape: result ? Object.keys(result).sort() : []
  };
  if (variant.expectArtifact) record.ok = record.ok && artifact.exists && artifact.size_bytes > 0;
  results.push(record);
  writeJson();
  if (accountRisk(result, thrown)) stopReason = 'BLOCKED_ACCOUNT_RISK';
  return record;
}

async function closeNonEssentialGeminiTabs() {
  try {
    const pages = await fetch('http://127.0.0.1:9225/json/list').then((r) => r.json());
    for (const page of pages) {
      const url = String(page.url || '');
      if (page.type !== 'page' || !/gemini\.google\.com/i.test(url)) continue;
      let keep = false;
      try {
        const parsed = new URL(url);
        keep = parsed.hostname === 'gemini.google.com' && parsed.pathname.replace(/\/$/, '') === '/app' && !parsed.search && !parsed.hash;
      } catch { keep = false; }
      if (!keep && page.id) await fetch(`http://127.0.0.1:9225/json/close/${page.id}`).catch(() => undefined);
    }
  } catch (error) {
    results.push({ variant: 'cleanup_close_tabs', backend: 'cdp', ok: false, message: error?.message || String(error) });
    writeJson();
  }
}

const uploadSingle = fixture('b2-upload-single.txt', 'Path C Gemini B2 upload single fixture.');
const uploadA = fixture('b2-upload-a.txt', 'Path C Gemini B2 upload multi fixture A.');
const uploadB = fixture('b2-upload-b.txt', 'Path C Gemini B2 upload multi fixture B.');
const uploadQuery = fixture('b2-upload-query.txt', 'The fixture answer token is B2-UPLOAD-QUERY.');

const variants = [
  {
    name: 'upload_single',
    domBackend: 'managed-cdp',
    env: 'WEBAI_GEMINI_UPLOAD_BACKEND',
    expectArtifact: false,
    call: () => tools.webAiGeminiUploadAndQuery({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'Reply with exactly: B2 upload single received', files: [uploadSingle], timeout_ms: 120000, response_timeout_ms: 120000 })
  },
  {
    name: 'upload_multi',
    domBackend: 'managed-cdp',
    env: 'WEBAI_GEMINI_UPLOAD_BACKEND',
    expectArtifact: false,
    call: () => tools.webAiGeminiUploadAndQuery({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'Reply with exactly: B2 upload multi received', files: [uploadA, uploadB], timeout_ms: 120000, response_timeout_ms: 120000 })
  },
  {
    name: 'upload_and_query',
    domBackend: 'managed-cdp',
    env: 'WEBAI_GEMINI_UPLOAD_BACKEND',
    expectArtifact: false,
    call: () => tools.webAiGeminiUploadAndQuery({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'What is the fixture answer token?', files: [uploadQuery], timeout_ms: 120000, response_timeout_ms: 120000 })
  },
  {
    name: 'generate_image_basic',
    env: 'WEBAI_GEMINI_GENERATE_IMAGE_BACKEND',
    expectArtifact: true,
    call: () => tools.webAiGeminiGenerateImage({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'Create a small simple blue square icon on a white background.', download_dir: downloadsDir, timeout_ms: 180000, response_timeout_ms: 180000 })
  },
  {
    name: 'generate_video_duration_2s',
    env: 'WEBAI_GEMINI_GENERATE_VIDEO_BACKEND',
    expectArtifact: true,
    call: () => tools.webAiGeminiGenerateVideo({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'Create the shortest 2 second video of a paper airplane gliding across a blank white background.', duration_seconds: 2, download_dir: downloadsDir, timeout_ms: 300000, response_timeout_ms: 300000 })
  },
  {
    name: 'music_generate_instrumental',
    env: 'WEBAI_GEMINI_MUSIC_GENERATE_BACKEND',
    expectArtifact: true,
    call: () => tools.webAiGeminiMusicGenerate({ profile: GEMINI_PROFILE, cdpPort: 9225, prompt: 'Instrumental ambient two bar loop, no vocals, calm synth pad.', confirmed: true, download_dir: downloadsDir, timeout_ms: 180000, response_timeout_ms: 180000 })
  }
];

(async () => {
  try {
    for (const variant of variants) {
      for (const backend of [variant.domBackend || 'extension-assisted-cdp', 'rpc']) {
        await callVariant(variant, backend);
        if (stopReason) break;
      }
      if (stopReason) break;
    }
  } finally {
    for (const file of fixtureFiles) fs.rmSync(file, { force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    await closeNonEssentialGeminiTabs();
    writeJson();
  }
  if (stopReason === 'BLOCKED_ACCOUNT_RISK') process.exitCode = 2;
  process.exit(process.exitCode || 0);
})();
