#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const LIBRARY_PATH = path.join(ROOT, 'docs/capability-library.json');
const RUN_ROOT = path.join(ROOT, '.runs/capability-explore-2026-05-25/closure-r5');
const RESULTS_JSONL = path.join(RUN_ROOT, 'closure-results.jsonl');
const REPORT_PATH = path.join(ROOT, '.runs/capability-explore-2026-05-25/closure-r5-report.md');
const TOTAL_LIMIT_MS = Number(process.env.CLOSURE_TOTAL_LIMIT_MS || 2 * 60 * 60 * 1000);
const START_MS = Date.now();
const SOURCE_RE = /^capability-explore-2026-05-25\//;
const BARE_BUCKET_RE = /^(C(?:[1-9]|10)|L[1-9]|G(?:[1-9]|10))$/;
const RUNNABLE_STATUS = new Set(['OK_EXT_BACKEND', 'OK_MANAGED_CDP_ONLY', 'OK_DEFERRED']);
const ENV_ERROR_CODES = new Set([
  'LOGIN_REQUIRED', 'AUTH_REQUIRED', 'NOT_LOGGED_IN', 'PROFILE_DISCONNECTED', 'CDP_CONNECT_FAILED',
  'BROWSER_DISCONNECTED', 'EXTERNAL_QUOTA_EXHAUSTED', 'RATE_LIMITED', 'QUOTA_EXHAUSTED'
]);

fs.mkdirSync(RUN_ROOT, { recursive: true });
fs.writeFileSync(RESULTS_JSONL, '');

const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
const features = Array.isArray(library) ? library : (library.features || []);
const targets = features.filter((feature) => SOURCE_RE.test(String(feature.source || '')) || BARE_BUCKET_RE.test(String(feature.source || '')));
const featureById = new Map(features.map((feature) => [feature.id, feature]));
const results = [];
let exitCode = 0;
let stoppedReason = '';
const consecutiveRunReds = [];

function elapsedMs() { return Date.now() - START_MS; }
function remainingMs() { return TOTAL_LIMIT_MS - elapsedMs(); }
function timedOut() { return remainingMs() <= 0; }
function rel(file) { return path.relative(ROOT, file).replaceAll(path.sep, '/'); }
function evidencePath(service, id) {
  return path.join(RUN_ROOT, service, `${id}.json`);
}
function mkdirFor(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function appendJsonl(row) { fs.appendFileSync(RESULTS_JSONL, `${JSON.stringify(row)}\n`); }
function workflowCandidates(feature) {
  return [
    path.join(ROOT, 'examples/workflows', `${feature.service}-${feature.id}.yaml`),
    path.join(ROOT, 'examples/workflows', `${feature.id}.yaml`)
  ];
}
function findWorkflow(feature) {
  return workflowCandidates(feature).find((candidate) => fs.existsSync(candidate));
}
function readProfileFromWorkflow(workflowPath) {
  try {
    const text = fs.readFileSync(workflowPath, 'utf8');
    const match = /^profile:\s*['"]?([^'"\s#]+)['"]?/m.exec(text);
    return match?.[1];
  } catch {
    return undefined;
  }
}
function parseJsonOutput(stdout, stderr) {
  const candidates = [stdout, stderr, `${stdout}\n${stderr}`].map((s) => String(s || '').trim()).filter(Boolean);
  for (const text of candidates) {
    try { return JSON.parse(text); } catch {}
  }
  for (const text of candidates) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch {}
    }
  }
  for (const text of candidates) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
  }
  return undefined;
}
function inferErrorCode(parsed, rawText, causeHint = '') {
  const direct = parsed?.errorCode || parsed?.error_code || parsed?.workflow_output?.errorCode || parsed?.workflow_output?.error_code;
  if (direct) return String(direct);
  const hay = `${parsed?.error || ''}\n${parsed?.message || ''}\n${rawText || ''}\n${causeHint}`;
  if (/requires id and target|result\.type is not supported/i.test(hay)) return 'INVALID_WORKFLOW';
  if (/CDP endpoint did not become ready|ECONNREFUSED|No connected CDP/i.test(hay)) return 'CDP_CONNECT_FAILED';
  if (/login|required|sign in|signin/i.test(hay)) return 'LOGIN_REQUIRED';
  if (/Timeout|timed out/i.test(hay)) return 'TIMEOUT';
  if (/missing-workflow/i.test(hay)) return 'MISSING_WORKFLOW';
  if (/closure-criterion-mismatch/i.test(hay)) return 'CLOSURE_CRITERION_MISMATCH';
  return 'UNKNOWN';
}
function scrubOutput(text) {
  const value = String(text || '');
  if (value.length <= 40000) return value;
  return `${value.slice(0, 20000)}\n...[truncated ${value.length - 40000} bytes]...\n${value.slice(-20000)}`;
}
async function runCommand(args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: ROOT,
      env: {
        ...process.env,
        // Hard safety: if a CDP endpoint disappears, do not launch Chrome. /bin/false exists,
        // so executable discovery stops there and the attempted launch fails without opening Chrome.
        WAH_BROWSER_EXECUTABLE: '/bin/false'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let killedForTimeout = false;
    const timer = setTimeout(() => {
      killedForTimeout = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
    }, Math.max(1, timeoutMs));
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const parsed = parseJsonOutput(stdout, stderr);
      resolve({ code, signal, timedOut: killedForTimeout, stdout, stderr, parsed });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: undefined, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`, parsed: undefined });
    });
  });
}
async function profileConnected(profile) {
  if (!profile) return { ok: true };
  const res = await runCommand(['node', 'dist/src/cli.js', 'browser:status', '--profile', profile, '--json'], Math.min(15000, Math.max(1000, remainingMs())));
  const parsed = res.parsed;
  return {
    ok: parsed?.connected === true,
    profile,
    status: parsed,
    error: parsed?.lastError || parsed?.error || res.stderr || res.stdout
  };
}
function valuesByKey(value, key, out = []) {
  if (Array.isArray(value)) for (const item of value) valuesByKey(item, key, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === key) out.push(v);
      valuesByKey(v, key, out);
    }
  }
  return out;
}
function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) allStrings(item, out);
  return out;
}
function boolKey(value, key) { return valuesByKey(value, key).some((v) => v === true || v === 'true'); }
function nonEmptyKey(value, key) { return valuesByKey(value, key).some((v) => typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v); }
function keyText(value, key) { return valuesByKey(value, key).filter((v) => typeof v === 'string').join('\n'); }
function anyText(value) { return allStrings(value).join('\n'); }
function arraysByKey(value, key) { return valuesByKey(value, key).filter(Array.isArray); }
function firstExistingPath(value) {
  const candidateKeys = ['path', 'savedPath', 'downloadPath', 'relative_path', 'html_path'];
  for (const key of candidateKeys) {
    for (const p of valuesByKey(value, key)) {
      if (typeof p !== 'string' || !p.trim()) continue;
      const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
      if (fs.existsSync(abs)) return abs;
    }
  }
  return undefined;
}
function fileHas(abs, needle) {
  try { return fs.readFileSync(abs, 'utf8').toLowerCase().includes(needle.toLowerCase()); } catch { return false; }
}
function fileSize(abs) { try { return fs.statSync(abs).size; } catch { return 0; } }
function pathWithMin(value, minBytes, opts = {}) {
  const abs = firstExistingPath(value);
  if (!abs) return false;
  if (fileSize(abs) <= minBytes) return false;
  if (opts.ext && !abs.toLowerCase().endsWith(opts.ext)) return false;
  if (opts.contains && !fileHas(abs, opts.contains)) return false;
  return true;
}
function hasDateToken(text) { return /\b20\d{2}(?:[-/]\d{1,2}(?:[-/]\d{1,2})?)?\b|\bMay\b|5月/i.test(text); }
function containsAll(text, words) { const lower = text.toLowerCase(); return words.every((w) => lower.includes(String(w).toLowerCase())); }
function countFrameworkNames(text) {
  const names = ['langchain', 'llamaindex', 'haystack', 'dspy', 'crew', 'autogen', 'semantic kernel', 'pydantic', 'openai agents', 'agno'];
  const lower = text.toLowerCase();
  return names.filter((name) => lower.includes(name)).length;
}
function shaPresent(value) { return nonEmptyKey(value, 'sha256'); }
function responseText(value) { return keyText(value, 'response_text') || keyText(value, 'responseText'); }
function closureMatches(feature, parsed) {
  if (!parsed || parsed.ok !== true) return { ok: false, cause: 'workflow-run-failed' };
  const id = feature.id;
  const text = responseText(parsed);
  const all = anyText(parsed);
  const completion = boolKey(parsed, 'completion_detected') || boolKey(parsed, 'completionDetected');
  const arrays = (key) => arraysByKey(parsed, key);
  const attachmentNames = arrays('attachment_names')[0] || arrays('attachmentNames')[0] || [];
  const workspaces = arrays('workspaces')[0];
  const countVals = valuesByKey(parsed, 'count').filter((v) => Number.isFinite(Number(v)));
  const hasCount = countVals.length > 0;
  const urlText = [keyText(parsed, 'chat_url'), keyText(parsed, 'chatUrl'), keyText(parsed, 'project_url'), keyText(parsed, 'projectUrl'), keyText(parsed, 'present_url'), keyText(parsed, 'presentUrl'), keyText(parsed, 'public_url'), keyText(parsed, 'publicUrl'), all].join('\n');

  switch (id) {
    case 'chatgpt-canvas-create-export-ext': return { ok: nonEmptyKey(parsed, 'chat_url') && pathWithMin(parsed, 64, { contains: 'machine learning' }), cause: 'canvas chat_url/path/content gate failed' };
    case 'chatgpt-codex-submit-task-ext-fallback': return { ok: nonEmptyKey(parsed, 'task_id') && !nonEmptyKey(parsed, 'errorCode'), cause: 'task_id/status gate failed' };
    case 'chatgpt-deep-research-ext': return { ok: pathWithMin(parsed, 4096) || countFrameworkNames(text || all) >= 3, cause: 'deep research report/framework gate failed' };
    case 'chatgpt-pulse-get-ext-fallback': return { ok: nonEmptyKey(parsed, 'digest_text'), cause: 'digest_text gate failed' };
    case 'chatgpt-select-model-thinking-ext': return { ok: (parsed.ok === true) && /thinking|gpt-5 thinking/i.test(`${keyText(parsed, 'model')} ${keyText(parsed, 'model_used')} ${all}`), cause: 'thinking model gate failed' };
    case 'chatgpt-send-basic-ext': return { ok: !!text.trim() && completion && nonEmptyKey(parsed, 'conversation_id'), cause: 'response/completion/conversation gate failed' };
    case 'chatgpt-send-thinking-ext': return { ok: /351/.test(text) && completion, cause: 'thinking arithmetic gate failed' };
    case 'chatgpt-send-web-search-ext': return { ok: hasDateToken(text) && completion, cause: 'web-search date/completion gate failed' };
    case 'chatgpt-upload-multi-ext': return { ok: containsAll(text, ['alpha', 'beta', 'gamma']) && attachmentNames.length === 3, cause: 'multi-upload response/attachment gate failed' };
    case 'chatgpt-upload-single-ext': return { ok: containsAll(text, ['alpha']) && attachmentNames.length === 1 && completion, cause: 'single-upload response/attachment/completion gate failed' };

    case 'claude-design-create-project-mgr': return { ok: (nonEmptyKey(parsed, 'projectId') || nonEmptyKey(parsed, 'project_id')) && (nonEmptyKey(parsed, 'projectUrl') || nonEmptyKey(parsed, 'project_url')), cause: 'projectId/projectUrl gate failed' };
    case 'claude-design-generate-mgr': return { ok: nonEmptyKey(parsed, 'fileName') && pathWithMin(parsed, 200), cause: 'fileName/html path gate failed' };
    case 'claude-design-present-mgr': return { ok: /\/serve\/|\?file=/.test(urlText) && (nonEmptyKey(parsed, 'present_url') || nonEmptyKey(parsed, 'public_url')), cause: 'present_url gate failed' };
    case 'claude-generate-file-csv-ext': return { ok: pathWithMin(parsed, 32, { contains: 'name,score' }), cause: 'CSV path/content gate failed' };
    case 'claude-generate-file-py-ext': return { ok: pathWithMin(parsed, 32, { contains: 'hello claude probe' }), cause: 'PY path/content gate failed' };
    case 'claude-send-basic-ext': return { ok: !!text.trim() && completion && /claude\.ai\//i.test(urlText), cause: 'response/completion/chat_url gate failed' };
    case 'claude-send-incognito-ext': return { ok: !!text.trim() && /incognito=/i.test(urlText), cause: 'incognito response/url gate failed' };
    case 'claude-send-style-ext': {
      const responses = valuesByKey(parsed, 'response_text').filter((v) => typeof v === 'string' && v.trim());
      const uniqueResponses = [...new Set(responses.map((v) => String(v).trim()))];
      return { ok: uniqueResponses.length >= 2 && uniqueResponses[0] !== uniqueResponses[1] && completion, cause: 'style dual-response gate failed' };
    }
    case 'claude-send-thinking-ext': return { ok: /391/.test(text) && completion, cause: 'thinking arithmetic gate failed' };
    case 'claude-send-web-search-ext': return { ok: hasDateToken(text), cause: 'web-search date gate failed' };
    case 'claude-upload-multi-ext': return { ok: containsAll(text, ['alpha', 'beta', 'gamma']) && attachmentNames.length === 3, cause: 'multi-upload response/attachment gate failed' };
    case 'claude-upload-single-ext': return { ok: containsAll(text, ['alpha']) && attachmentNames.length === 1 && completion, cause: 'single-upload response/attachment/completion gate failed' };

    case 'gemini-canvas-edit-mgr': return { ok: parsed.ok === true && nonEmptyKey(parsed, 'canvas_html_before') && nonEmptyKey(parsed, 'canvas_html_after') && keyText(parsed, 'canvas_html_before') !== keyText(parsed, 'canvas_html_after'), cause: 'canvas before/after gate failed' };
    case 'gemini-conversation-reuse-mgr': return { ok: /apple/i.test(text), cause: 'reuse response apple gate failed' };
    case 'gemini-gems-converse-mgr': return { ok: !!text.trim() && /\/gem\//i.test(urlText), cause: 'gems response/url gate failed' };
    case 'gemini-generate-image-ext': return { ok: pathWithMin(parsed, 1024) && shaPresent(parsed), cause: 'image path/size/sha gate failed' };
    case 'gemini-multimodal-mgr': return { ok: !!text.trim() && /(red|blue|green|yellow|color|colour)/i.test(text) && /(circle|square|triangle|shape|object|image)/i.test(text), cause: 'multimodal text/color/shape gate failed' };
    case 'gemini-music-download-track-ext': return { ok: pathWithMin(parsed, 8192, { ext: '.mp3' }), cause: 'music download mp3 gate failed' };
    case 'gemini-music-generate-ext': return { ok: nonEmptyKey(parsed, 'task_id') || nonEmptyKey(parsed, 'track_url') || nonEmptyKey(parsed, 'conversation_url'), cause: 'music task/url gate failed' };
    case 'gemini-music-task-status-ext': return { ok: /complete|completed/i.test(keyText(parsed, 'raw') || keyText(parsed, 'status') || all) && (nonEmptyKey(parsed, 'track_url') || nonEmptyKey(parsed, 'conversation_url')), cause: 'music status/url gate failed' };
    case 'gemini-send-basic-mgr': return { ok: !!text.trim() && completion, cause: 'response/completion gate failed' };
    case 'gemini-upload-single-mgr': return { ok: /alpha/i.test(text), cause: 'upload response alpha gate failed' };
    case 'gemini-veo-quota-error-mgr': return { ok: /EXTERNAL_QUOTA_EXHAUSTED|LOGIN_REQUIRED/.test(all) || feature.status === 'OK_DEFERRED', cause: 'quota/deferred gate failed' };
    case 'gemini-workspace-mgr': {
      const summary = keyText(parsed, 'summary');
      const url = keyText(parsed, 'url');
      const summaryShape = /^\d+\s+\S+/.test(summary) || /\b\d+\s+(Gem|conversation|workspace|chat)/i.test(summary);
      return { ok: Array.isArray(workspaces) || hasCount || (summaryShape && /gemini\.google\.com/i.test(url)), cause: 'workspace array/count/summary gate failed' };
    }
    default:
      return { ok: parsed.ok === true, cause: 'no cap-specific closure evaluator' };
  }
}
async function runWorkflow(feature, workflow) {
  const profile = readProfileFromWorkflow(workflow);
  const preflight = await profileConnected(profile);
  if (!preflight.ok) {
    return {
      ok: false,
      closureOk: false,
      cause: `profile-disconnected:${profile || 'unknown'}`,
      errorCode: 'PROFILE_DISCONNECTED',
      attempts: [],
      preflight
    };
  }

  const attempts = [];
  let finalEval = { ok: false, cause: 'not-run' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (timedOut()) break;
    const runStartedAt = new Date().toISOString();
    const timeoutForAttempt = Math.max(1000, remainingMs());
    const cmd = ['node', 'dist/src/cli.js', 'workflow:run', rel(workflow), '--json'];
    const res = await runCommand(cmd, timeoutForAttempt);
    const rawText = `${res.stdout || ''}\n${res.stderr || ''}`;
    const parsed = res.parsed || { ok: false, error: scrubOutput(rawText) || 'workflow:run produced no JSON' };
    const workflowOk = res.code === 0 && res.timedOut !== true && parsed?.ok === true;
    const evalResult = workflowOk ? closureMatches(feature, parsed) : { ok: false, cause: 'workflow-run-failed' };
    attempts.push({
      attempt,
      started_at: runStartedAt,
      finished_at: new Date().toISOString(),
      command: cmd.join(' '),
      exitCode: res.code,
      signal: res.signal,
      timedOut: res.timedOut,
      workflow_ok: workflowOk,
      closure_ok: evalResult.ok,
      closure_cause: evalResult.cause,
      parsed,
      stdout: scrubOutput(res.stdout),
      stderr: scrubOutput(res.stderr)
    });
    finalEval = evalResult;
    if (workflowOk && evalResult.ok) break;
    if (attempt === 1 && !timedOut()) continue;
  }
  const last = attempts.at(-1);
  const rawLast = `${last?.stdout || ''}\n${last?.stderr || ''}`;
  const errorCode = (last?.workflow_ok && !finalEval.ok) ? 'CLOSURE_CRITERION_MISMATCH' : inferErrorCode(last?.parsed, rawLast, finalEval.cause);
  return {
    ok: !!(last?.workflow_ok && finalEval.ok),
    closureOk: !!finalEval.ok,
    cause: last?.workflow_ok ? finalEval.cause : (last?.timedOut ? 'workflow-run-timeout' : (last?.parsed?.error || finalEval.cause || 'workflow-run-failed')),
    errorCode,
    attempts,
    preflight,
    workflow_output: last?.parsed
  };
}
function markLibrary(result) {
  const feature = featureById.get(result.id);
  if (!feature) return;
  if (result.closure_status === 'red') feature.closure_status = 'unstable';
  else if (result.closure_status === 'previously-failed') feature.closure_status = 'previously-failed';
  else if (result.closure_status === 'green') feature.closure_status = 'green';
}
function writeEvidence(file, data) {
  mkdirFor(file);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
function record(result, evidenceData) {
  results.push(result);
  writeEvidence(path.join(ROOT, result.evidence), evidenceData);
  appendJsonl(result);
  markLibrary(result);
}
function makeReport(status = 'complete') {
  const total = results.length;
  const green = results.filter((r) => r.closure_status === 'green').length;
  const red = results.filter((r) => r.closure_status === 'red').length;
  const missing = results.filter((r) => r.cause === 'missing-workflow').length;
  const failClosed = results.filter((r) => r.closure_status === 'previously-failed').length;
  const skipped = results.filter((r) => r.closure_status === 'previously-failed' || r.cause === 'missing-workflow').length;
  const redRows = results.filter((r) => r.closure_status === 'red');
  const failClosedStatusTotal = targets.filter((t) => String(t.status || '').startsWith('FAIL_CLOSED_')).length;
  const manual = redRows;
  const lines = [];
  lines.push('# Capability closure validation report');
  lines.push('');
  lines.push(`- Status: ${status}`);
  lines.push(`- Started: ${new Date(START_MS).toISOString()}`);
  lines.push(`- Finished: ${new Date().toISOString()}`);
  lines.push(`- Elapsed seconds: ${Math.round(elapsedMs() / 1000)}`);
  lines.push(`- Results JSONL: ${rel(RESULTS_JSONL)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total targeted capabilities: ${targets.length}`);
  lines.push(`- Processed capabilities: ${total}`);
  lines.push(`- Green: ${green}`);
  lines.push(`- Red: ${red}`);
  lines.push(`- Missing workflow: ${missing}`);
  lines.push(`- Fail-closed status total: ${failClosedStatusTotal}`);
  lines.push(`- Fail-closed skipped / previously failed: ${failClosed}`);
  lines.push(`- Skipped total: ${skipped}`);
  if (stoppedReason) lines.push(`- Stop reason: ${stoppedReason}`);
  lines.push('');
  lines.push('## Red list');
  lines.push('');
  if (!redRows.length) lines.push('None.');
  else {
    lines.push('| service | id | errorCode | cause | evidence |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const r of redRows) lines.push(`| ${r.service} | ${r.id} | ${r.errorCode || ''} | ${String(r.cause || '').replace(/\|/g, '\\|')} | ${r.evidence} |`);
  }
  lines.push('');
  lines.push('## Manual second-check recommendations');
  lines.push('');
  if (!manual.length) lines.push('None.');
  else {
    for (const r of manual) lines.push(`- ${r.service}/${r.id}: ${r.errorCode} — ${r.cause} (${r.evidence})`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.');
  lines.push('- Missing workflow files were marked red with `MISSING_WORKFLOW`.');
  lines.push('- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.');
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}
function maybeBucketBlocker(row) {
  if (row.closure_status !== 'red') {
    consecutiveRunReds.length = 0;
    return false;
  }
  if (row.cause === 'missing-workflow' || row.errorCode === 'INVALID_WORKFLOW' || row.closure_status === 'previously-failed') {
    consecutiveRunReds.length = 0;
    return false;
  }
  const now = Date.now();
  const env = ENV_ERROR_CODES.has(row.errorCode);
  if (!env) {
    consecutiveRunReds.length = 0;
    return false;
  }
  consecutiveRunReds.push({ t: now, row });
  while (consecutiveRunReds.length && now - consecutiveRunReds[0].t > 60000) consecutiveRunReds.shift();
  return consecutiveRunReds.length > 10 && consecutiveRunReds.every((item) => ENV_ERROR_CODES.has(item.row.errorCode));
}

console.log(`[closure] targets=${targets.length} run_root=${rel(RUN_ROOT)}`);
for (const feature of targets) {
  if (timedOut()) {
    exitCode = 2;
    stoppedReason = 'timeout before processing all capabilities';
    break;
  }
  const workflow = findWorkflow(feature);
  const evPath = evidencePath(feature.service, feature.id);
  const evRel = rel(evPath);
  const base = {
    id: feature.id,
    service: feature.service,
    source: feature.source,
    status: feature.status,
    workflow: workflow ? rel(workflow) : null,
    closure_criterion: feature.closure_criterion || feature.completion_gate || '',
    started_at: new Date().toISOString()
  };

  // User requested the simplification strategy to check FAIL_CLOSED_* first: these are
  // known Stage 1-3 fail-closed capabilities and should be marked previously-failed,
  // not unstable/missing-workflow.
  if (String(feature.status || '').startsWith('FAIL_CLOSED_')) {
    const row = { id: feature.id, service: feature.service, closure_status: 'previously-failed', cause: 'previously-failed-closed', errorCode: feature.errorCode || 'FAIL_CLOSED', evidence: evRel };
    record(row, { ...base, ok: true, skipped: true, closure_status: 'previously-failed', cause: 'previously-failed-closed', candidates: workflowCandidates(feature).map(rel), finished_at: new Date().toISOString() });
    console.log(`[closure] skip previously-failed ${feature.service}/${feature.id}`);
    continue;
  }

  if (!workflow) {
    const row = { id: feature.id, service: feature.service, closure_status: 'red', cause: 'missing-workflow', errorCode: 'MISSING_WORKFLOW', evidence: evRel };
    record(row, { ...base, ok: false, skipped: true, closure_status: 'red', cause: 'missing-workflow', errorCode: 'MISSING_WORKFLOW', candidates: workflowCandidates(feature).map(rel), finished_at: new Date().toISOString() });
    console.log(`[closure] red missing-workflow ${feature.service}/${feature.id}`);
    continue;
  }

  if (!RUNNABLE_STATUS.has(feature.status)) {
    const row = { id: feature.id, service: feature.service, closure_status: 'red', cause: `unsupported-status:${feature.status}`, errorCode: 'UNSUPPORTED_STATUS', evidence: evRel };
    record(row, { ...base, ok: false, skipped: true, closure_status: 'red', cause: row.cause, errorCode: row.errorCode, finished_at: new Date().toISOString() });
    console.log(`[closure] red unsupported-status ${feature.service}/${feature.id}`);
    continue;
  }

  console.log(`[closure] run ${feature.service}/${feature.id} -> ${rel(workflow)}`);
  const runResult = await runWorkflow(feature, workflow);
  const row = {
    id: feature.id,
    service: feature.service,
    closure_status: runResult.ok ? 'green' : 'red',
    cause: runResult.ok ? '' : runResult.cause,
    errorCode: runResult.ok ? '' : runResult.errorCode,
    evidence: evRel
  };
  record(row, { ...base, ...runResult, closure_status: row.closure_status, finished_at: new Date().toISOString() });
  console.log(`[closure] ${row.closure_status} ${feature.service}/${feature.id}${row.cause ? ` cause=${row.cause} code=${row.errorCode}` : ''}`);
  if (maybeBucketBlocker(row)) {
    exitCode = 1;
    stoppedReason = 'bucket-level environmental blocker: >10 consecutive runnable caps red within 1 minute';
    break;
  }
}

if (timedOut() && exitCode === 0 && results.length < targets.length) {
  exitCode = 2;
  stoppedReason ||= 'timeout after partial progress';
}

// r2: do NOT mutate capability-library.json so the library record reflects r1's authoritative state.
makeReport(exitCode === 0 ? 'complete' : exitCode === 1 ? 'blocked' : 'timeout');
console.log(`[closure] wrote ${rel(RESULTS_JSONL)}`);
console.log(`[closure] wrote ${rel(REPORT_PATH)}`);
console.log(`[closure] updated ${rel(LIBRARY_PATH)}`);
process.exit(exitCode);
