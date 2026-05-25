#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const campaign = 'capability-explore-2026-05-25';
const service = 'claude';
const bucket = 'L2';
const backend = 'extension-assisted-cdp';
const profile = 'claude-9224';
const verifiedBy = 'codex-bucket-L2';
const source = `${campaign}/${bucket}`;
const lastUpdate = '2026-05-25';
const outDir = path.join(repo, '.runs', campaign, service);
const workflowsDir = path.join(repo, 'examples', 'workflows');
const heartbeatPath = path.join(outDir, 'heartbeat.log');
const libraryPath = path.join(outDir, 'library-additions.jsonl');
const blockerPath = path.join(outDir, `${bucket}-blocker.md`);
const maxRunMs = 25 * 60 * 1000;
const runStart = Date.now();

mkdirSync(outDir, { recursive: true });
mkdirSync(workflowsDir, { recursive: true });
if (existsSync(blockerPath)) rmSync(blockerPath, { force: true });

const capIds = new Set(['claude-send-incognito-ext', 'claude-send-style-ext']);
if (existsSync(libraryPath)) {
  const kept = readFileSync(libraryPath, 'utf8')
    .split(/\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      try { return !capIds.has(JSON.parse(line).id); } catch { return true; }
    });
  writeFileSync(libraryPath, kept.length ? kept.join('\n') + '\n' : '');
}

function iso() { return new Date().toISOString(); }
function rel(p) { return path.relative(repo, p).replaceAll(path.sep, '/'); }
function q(s) { return /[\s"'`$\\]/.test(String(s)) ? JSON.stringify(String(s)) : String(s); }
function commandString(args) { return args.map(q).join(' '); }
function pick(obj, keys) {
  for (const key of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}
function boolTrue(value) { return value === true || value === 'true'; }
function text(value) { return typeof value === 'string' ? value : value == null ? '' : String(value); }
function extractJson(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return { parsed: null, parse_error: 'empty stdout' };
  try { return { parsed: JSON.parse(raw), parse_error: null }; } catch {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = raw.slice(first, last + 1);
    try { return { parsed: JSON.parse(candidate), parse_error: null, json_candidate: candidate }; }
    catch (error) { return { parsed: null, parse_error: error?.message || String(error), json_candidate: candidate }; }
  }
  return { parsed: null, parse_error: 'no JSON object found' };
}
function summarize(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  return JSON.stringify({
    ok: parsed.ok,
    completion_detected: pick(parsed, ['completion_detected', 'completionDetected']),
    response_text: text(pick(parsed, ['response_text', 'responseText', 'text', 'answer'])).slice(0, 280),
    chat_url: text(pick(parsed, ['chat_url', 'chatUrl', 'conversation_url', 'conversationUrl', 'url'])),
    errorCode: parsed.errorCode || parsed.error_code,
    message: parsed.message || parsed.error
  }, null, 2);
}
async function runCli(args, timeoutMs) {
  const started = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const wall_ms = Date.now() - started;
      const extracted = extractJson(stdout);
      resolve({ command: commandString(args), code, signal, timed_out: timedOut, wall_ms, stdout, stderr, ...extracted });
    });
  });
}
function unsupportedFrom(result) {
  const parsed = result?.parsed || {};
  const raw = `${parsed.errorCode || parsed.error_code || ''}\n${parsed.message || ''}\n${parsed.error || ''}\n${result?.stderr || ''}\n${result?.stdout || ''}`;
  return /Use style|style option|style menu|UNSUPPORTED_FEATURE|old UI/i.test(raw)
    || (/ELEMENT_NOT_FOUND/.test(raw) && /style/i.test(raw));
}
function writeWorkflow(capId, content) {
  const file = path.join(workflowsDir, `claude-${capId}.yaml`);
  writeFileSync(file, content);
  return rel(file);
}
function writeEvidence(capId, evidence) {
  const file = path.join(outDir, `${capId}.json`);
  writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
  return rel(file);
}
function appendLibrary(entry) {
  appendFileSync(libraryPath, JSON.stringify(entry) + '\n');
}
function heartbeat(capId, status, wallMs, evidenceRel) {
  appendFileSync(heartbeatPath, `${iso()} ${bucket}/${capId} ${status} ${wallMs} ${evidenceRel}\n`);
}
function baseEntry({ capId, name, ui_location, status, evidenceRel, workflowRel, completion_gate, artifact, errorCode, cause, notes }) {
  const entry = {
    id: capId,
    service,
    name,
    ui_location,
    source,
    status,
    mcp_tool: 'webai_claude_send_prompt',
    backend,
    evidence: evidenceRel,
    verified_by: verifiedBy,
    recipe_ref: workflowRel,
    sub_mcp_candidate: false,
    completion_gate,
    artifact,
    last_update: lastUpdate,
    notes
  };
  if (errorCode) entry.errorCode = errorCode;
  if (cause) entry.cause = cause;
  return entry;
}
function failCause(results, gate) {
  const terminal = Array.isArray(results) ? results.findLast?.((r) => r) || results[results.length - 1] : results;
  const parsed = terminal?.parsed || {};
  return parsed.message || parsed.error || terminal?.parse_error || gate?.cause || 'completion gate not satisfied';
}

async function runIncognito() {
  const capId = 'claude-send-incognito-ext';
  const capStart = Date.now();
  const args = ['node', 'dist/src/cli.js', 'webai:claude:send-prompt', '--profile', profile, '--backend', backend, '--incognito', '--prompt', 'say only OK', '--response-timeout-ms', '90000', '--json'];
  console.log(`[${iso()}] ${bucket}/${capId}: ${commandString(args)}`);
  const result = await runCli(args, 130000);
  const parsed = result.parsed || {};
  const response = text(pick(parsed, ['response_text', 'responseText', 'text', 'answer'])).trim();
  const chatUrl = text(pick(parsed, ['chat_url', 'chatUrl', 'conversation_url', 'conversationUrl', 'url'])).trim();
  const gate = { response_text_nonempty: Boolean(response), chat_url_contains_incognito: chatUrl.includes('incognito='), chat_url: chatUrl };
  const ok = result.code === 0 && Boolean(result.parsed) && gate.response_text_nonempty && gate.chat_url_contains_incognito;
  const status = ok ? 'OK_EXT_BACKEND' : 'FAIL_CLOSED_EXT_BACKEND';
  const workflowRel = writeWorkflow(capId, `# Generated by ${campaign} ${bucket}\nid: claude-${capId}\nservice: claude\ntarget: claude\ncapability_id: ${capId}\nmode: assisted\nbackend: ${backend}\nprofile: ${profile}\nsteps:\n  - name: Send a prompt in Claude incognito mode\n    command:\n      - node\n      - dist/src/cli.js\n      - webai:claude:send-prompt\n      - --profile\n      - ${profile}\n      - --backend\n      - ${backend}\n      - --incognito\n      - --prompt\n      - say only OK\n      - --response-timeout-ms\n      - \"90000\"\n      - --json\nsuccess_gate: response_text non-empty AND chat_url contains \"incognito=\"\nevidence: .runs/${campaign}/${service}/${capId}.json\n`);
  const wall_ms = Date.now() - capStart;
  const evidence = {
    id: capId,
    service,
    bucket,
    backend,
    profile,
    status,
    ok,
    completion_gate: 'response_text non-empty AND chat_url contains "incognito="',
    gate_eval: gate,
    attempts: [{ attempt: 1, ...result }],
    terminal_result: result,
    workflow: workflowRel,
    started_at: new Date(capStart).toISOString(),
    finished_at: iso(),
    wall_ms
  };
  const evidenceRel = writeEvidence(capId, evidence);
  const errorCode = ok ? undefined : (result.timed_out ? 'COMMAND_TIMEOUT' : (parsed.errorCode || parsed.error_code || 'GATE_FAILED'));
  appendLibrary(baseEntry({
    capId,
    name: 'Claude send prompt in incognito mode via extension-assisted CDP',
    ui_location: 'Claude new chat incognito URL → composer → assistant response',
    status,
    evidenceRel,
    workflowRel,
    completion_gate: 'response_text non-empty AND chat_url contains "incognito="',
    artifact: 'Incognito chat response with incognito URL marker',
    errorCode,
    cause: ok ? undefined : failCause(result, gate),
    notes: ok ? `Verified live with ${backend} using profile ${profile}.` : `Fail-closed with ${backend} using profile ${profile}.`
  }));
  heartbeat(capId, ok ? 'ok' : 'fail-closed', wall_ms, evidenceRel);
  console.log(`[${iso()}] ${bucket}/${capId} code=${result.code} wall_ms=${result.wall_ms} gate=${ok}\n${summarize(parsed)}`);
  return { capId, status, ok, evidenceRel, workflowRel, wall_ms };
}

async function runStyle() {
  const capId = 'claude-send-style-ext';
  const capStart = Date.now();
  const prompt = 'Tell me one sentence about machine learning.';
  const styles = ['Concise', 'Explanatory'];
  const attempts = [];
  for (const style of styles) {
    if (Date.now() - runStart > maxRunMs) break;
    const args = ['node', 'dist/src/cli.js', 'webai:claude:send-prompt', '--profile', profile, '--backend', backend, '--style', style, '--prompt', prompt, '--response-timeout-ms', '90000', '--json'];
    console.log(`[${iso()}] ${bucket}/${capId}/${style}: ${commandString(args)}`);
    const result = await runCli(args, 130000);
    attempts.push({ style, ...result });
    console.log(`[${iso()}] ${bucket}/${capId}/${style} code=${result.code} wall_ms=${result.wall_ms}\n${summarize(result.parsed)}`);
  }
  const byStyle = Object.fromEntries(attempts.map((a) => [a.style, a]));
  const evals = styles.map((style) => {
    const r = byStyle[style];
    const parsed = r?.parsed || {};
    const response = text(pick(parsed, ['response_text', 'responseText', 'text', 'answer'])).trim();
    const completion = boolTrue(pick(parsed, ['completion_detected', 'completionDetected']));
    return { style, command_exit_zero: r?.code === 0, completion_detected: completion, response_text_nonempty: Boolean(response), response_text: response, chat_url: text(pick(parsed, ['chat_url', 'chatUrl', 'conversation_url', 'conversationUrl', 'url'])).trim(), errorCode: parsed.errorCode || parsed.error_code };
  });
  const allCompleted = evals.length === 2 && evals.every((e) => e.command_exit_zero && e.completion_detected && e.response_text_nonempty);
  const outputsDifferent = evals.length === 2 && evals[0].response_text && evals[1].response_text && evals[0].response_text !== evals[1].response_text;
  const unsupported = attempts.some(unsupportedFrom);
  const ok = allCompleted && outputsDifferent;
  const status = ok ? 'OK_EXT_BACKEND' : (unsupported ? 'FAIL_CLOSED_UNSUPPORTED' : 'FAIL_CLOSED_EXT_BACKEND');
  const workflowRel = writeWorkflow(capId, `# Generated by ${campaign} ${bucket}\nid: claude-${capId}\nservice: claude\ntarget: claude\ncapability_id: ${capId}\nmode: assisted\nbackend: ${backend}\nprofile: ${profile}\nsteps:\n  - name: Send prompt with Claude Concise style\n    command:\n      - node\n      - dist/src/cli.js\n      - webai:claude:send-prompt\n      - --profile\n      - ${profile}\n      - --backend\n      - ${backend}\n      - --style\n      - Concise\n      - --prompt\n      - ${prompt}\n      - --response-timeout-ms\n      - \"90000\"\n      - --json\n  - name: Send prompt with Claude Explanatory style\n    command:\n      - node\n      - dist/src/cli.js\n      - webai:claude:send-prompt\n      - --profile\n      - ${profile}\n      - --backend\n      - ${backend}\n      - --style\n      - Explanatory\n      - --prompt\n      - ${prompt}\n      - --response-timeout-ms\n      - \"90000\"\n      - --json\nsuccess_gate: both runs completion_detected === true AND response_text non-empty AND response_text values differ\nevidence: .runs/${campaign}/${service}/${capId}.json\n`);
  const wall_ms = Date.now() - capStart;
  const gate = { all_completed: allCompleted, outputs_different: outputsDifferent, per_style: evals, unsupported_feature_detected: unsupported };
  const evidence = {
    id: capId,
    service,
    bucket,
    backend,
    profile,
    status,
    ok,
    completion_gate: 'both runs completion_detected === true AND response_text non-empty AND response_text values differ',
    gate_eval: gate,
    attempts,
    workflow: workflowRel,
    started_at: new Date(capStart).toISOString(),
    finished_at: iso(),
    wall_ms
  };
  const evidenceRel = writeEvidence(capId, evidence);
  const errorCode = ok ? undefined : (unsupported ? 'UNSUPPORTED_FEATURE' : (attempts.some((a) => a.timed_out) ? 'COMMAND_TIMEOUT' : 'GATE_FAILED'));
  appendLibrary(baseEntry({
    capId,
    name: 'Claude send prompt with style preset via extension-assisted CDP',
    ui_location: 'Claude composer plus menu → Use style → Concise/Explanatory → assistant response',
    status,
    evidenceRel,
    workflowRel,
    completion_gate: 'both runs completion_detected === true AND response_text non-empty AND response_text values differ',
    artifact: 'Pair of styled Claude chat responses',
    errorCode,
    cause: ok ? undefined : failCause(attempts, gate),
    notes: ok ? `Verified live with ${backend} using profile ${profile}; Concise and Explanatory responses differed.` : (unsupported ? 'Fail-closed: Claude style picker/option was unavailable in the current account UI.' : `Fail-closed with ${backend} using profile ${profile}.`)
  }));
  heartbeat(capId, ok ? 'ok' : 'fail-closed', wall_ms, evidenceRel);
  return { capId, status, ok, evidenceRel, workflowRel, wall_ms };
}

async function main() {
  const results = [];
  results.push(await runIncognito());
  if (Date.now() - runStart > maxRunMs) {
    writeFileSync(blockerPath, `# ${bucket} blocker\n\nExceeded 25 minute lane budget before claude-send-style-ext.\n`);
    process.exitCode = 2;
    return;
  }
  results.push(await runStyle());
  const summaryPath = path.join(outDir, `${bucket}-summary.json`);
  const failures = results.filter((r) => !r.ok);
  writeFileSync(summaryPath, JSON.stringify({ bucket, service, backend, profile, failures: failures.length, results }, null, 2) + '\n');
  if (failures.length === results.length) {
    writeFileSync(blockerPath, `# ${bucket} blocker\n\nAll ${results.length} capabilities failed.\n\nFailures:\n${failures.map((f) => `- ${f.capId}: ${f.status}; evidence ${f.evidenceRel}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

main().catch((error) => {
  writeFileSync(blockerPath, `# ${bucket} runner error\n\n${error?.stack || error}\n`);
  console.error(error?.stack || error);
  process.exitCode = 1;
});
