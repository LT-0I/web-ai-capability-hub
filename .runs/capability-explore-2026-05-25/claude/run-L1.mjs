#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const campaign = 'capability-explore-2026-05-25';
const service = 'claude';
const bucket = 'L1';
const outDir = path.join(repo, '.runs', campaign, service);
const heartbeatPath = path.join(outDir, 'heartbeat.log');
const libraryPath = path.join(outDir, 'library-additions.jsonl');
const blockerPath = path.join(outDir, `${bucket}-blocker.md`);
const backend = 'extension-assisted-cdp';
const profile = 'claude-9224';
const verifiedBy = 'codex-bucket-L1';
const source = `${campaign}/${bucket}`;
const lastUpdate = new Date().toISOString().slice(0, 10);
const runStart = Date.now();
const maxRunMs = 25 * 60 * 1000;

mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(repo, 'examples', 'workflows'), { recursive: true });

function iso() { return new Date().toISOString(); }
function rel(p) { return path.relative(repo, p).replaceAll(path.sep, '/'); }
function shellQuote(s) { return /[\s"'`$\\]/.test(String(s)) ? JSON.stringify(String(s)) : String(s); }
function commandString(args) { return args.map(shellQuote).join(' '); }
function pick(obj, names) {
  for (const name of names) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, name) && obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}
function textOf(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function boolTrue(v) { return v === true || v === 'true'; }
function extractJson(stdout) {
  const s = String(stdout || '').trim();
  if (!s) return { parsed: null, parse_error: 'empty stdout' };
  try { return { parsed: JSON.parse(s), parse_error: null }; } catch {}
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = s.slice(first, last + 1);
    try { return { parsed: JSON.parse(candidate), parse_error: null }; }
    catch (e) { return { parsed: null, parse_error: e?.message || String(e), candidate }; }
  }
  return { parsed: null, parse_error: 'no JSON object found' };
}
function resultSummary(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const rt = textOf(pick(parsed, ['response_text', 'responseText', 'text', 'answer']));
  const model = textOf(pick(parsed, ['model_used', 'modelUsed', 'model']));
  const url = textOf(pick(parsed, ['chat_url', 'chatUrl', 'conversation_url', 'conversationUrl', 'url']));
  return JSON.stringify({ ok: parsed.ok, completion_detected: pick(parsed, ['completion_detected', 'completionDetected']), response_text: rt.slice(0, 240), model_used: model, chat_url: url, errorCode: parsed.errorCode || parsed.error_code }, null, 2);
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
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000).unref();
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const wall_ms = Date.now() - started;
      const { parsed, parse_error, candidate } = extractJson(stdout);
      resolve({ command: commandString(args), code, signal, timed_out: timedOut, wall_ms, stdout, stderr, parsed, parse_error, json_candidate: candidate });
    });
  });
}

const capDefs = [
  {
    id: 'claude-send-basic-ext',
    name: 'Claude send basic prompt via extension-assisted CDP',
    mcp_tool: 'webai_claude_send_prompt',
    ui_location: 'Claude main chat composer → send button → assistant response',
    completion_gate: 'response_text non-empty + completion_detected === true + chat_url captured',
    artifact: 'Main chat text response',
    timeoutMs: 130000,
    args: () => ['node', 'dist/src/cli.js', 'webai:claude:send-prompt', '--profile', profile, '--backend', backend, '--prompt', 'say only the word OK', '--response-timeout-ms', '90000', '--json'],
    gate: (r) => {
      const response = textOf(pick(r, ['response_text', 'responseText', 'text', 'answer'])).trim();
      const completion = boolTrue(pick(r, ['completion_detected', 'completionDetected']));
      const chatUrl = textOf(pick(r, ['chat_url', 'chatUrl', 'conversation_url', 'conversationUrl', 'url'])).trim();
      return { ok: Boolean(response) && completion && Boolean(chatUrl), details: { response_nonempty: Boolean(response), completion_detected: completion, chat_url: chatUrl }, chatUrl };
    },
    workflowInput: { prompt: 'say only the word OK', response_timeout_ms: 90000 }
  },
  {
    id: 'claude-select-model-sonnet-ext',
    name: 'Claude select Sonnet 4.6 model via extension-assisted CDP',
    mcp_tool: 'webai_claude_select_model',
    ui_location: 'Claude main chat model picker → Sonnet 4.6',
    completion_gate: 'ok === true AND model_used contains "Sonnet"',
    artifact: 'Model picker state',
    timeoutMs: 90000,
    args: (ctx) => ['node', 'dist/src/cli.js', 'webai:claude:select-model', '--profile', profile, '--backend', backend, '--model', 'Sonnet 4.6', '--tab-url-contains', ctx.chatUrl, '--json'],
    precondition: (ctx) => Boolean(ctx.chatUrl),
    preconditionCause: 'missing chat_url from claude-send-basic-ext',
    gate: (r) => {
      const ok = boolTrue(r?.ok);
      const model = textOf(pick(r, ['model_used', 'modelUsed', 'model']));
      return { ok: ok && /Sonnet/i.test(model), details: { ok, model_used: model } };
    },
    workflowInput: { model: 'Sonnet 4.6' }
  },
  {
    id: 'claude-send-thinking-ext',
    name: 'Claude send prompt with thinking enabled via extension-assisted CDP',
    mcp_tool: 'webai_claude_send_prompt',
    ui_location: 'Claude main chat composer → thinking option → assistant response',
    completion_gate: 'response_text contains "391" + completion_detected === true',
    artifact: 'Main chat thinking response',
    timeoutMs: 230000,
    args: (ctx) => ['node', 'dist/src/cli.js', 'webai:claude:send-prompt', '--profile', profile, '--backend', backend, '--thinking', '--reuse-conversation', '--tab-url-contains', ctx.chatUrl, '--prompt', 'Think step by step: 17 × 23 = ?', '--response-timeout-ms', '180000', '--json'],
    precondition: (ctx) => Boolean(ctx.chatUrl),
    preconditionCause: 'missing chat_url from claude-send-basic-ext',
    gate: (r) => {
      const response = textOf(pick(r, ['response_text', 'responseText', 'text', 'answer']));
      const completion = boolTrue(pick(r, ['completion_detected', 'completionDetected']));
      return { ok: /391/.test(response) && completion, details: { contains_391: /391/.test(response), completion_detected: completion } };
    },
    workflowInput: { prompt: 'Think step by step: 17 × 23 = ?', thinking: true, reuse_conversation: true, response_timeout_ms: 180000 }
  },
  {
    id: 'claude-send-web-search-ext',
    name: 'Claude send prompt with web search enabled via extension-assisted CDP',
    mcp_tool: 'webai_claude_send_prompt',
    ui_location: 'Claude main chat composer → web search option → assistant response',
    completion_gate: 'response_text contains a date marker such as "2026", "May", or "5月"',
    artifact: 'Main chat web-search response',
    timeoutMs: 170000,
    args: (ctx) => ['node', 'dist/src/cli.js', 'webai:claude:send-prompt', '--profile', profile, '--backend', backend, '--web-search', '--reuse-conversation', '--tab-url-contains', ctx.chatUrl, '--prompt', "What is today's date?", '--response-timeout-ms', '120000', '--json'],
    precondition: (ctx) => Boolean(ctx.chatUrl),
    preconditionCause: 'missing chat_url from claude-send-basic-ext',
    gate: (r) => {
      const response = textOf(pick(r, ['response_text', 'responseText', 'text', 'answer']));
      return { ok: /2026|May|5月|五月/i.test(response), details: { contains_date_marker: /2026|May|5月|五月/i.test(response) } };
    },
    workflowInput: { prompt: "What is today's date?", web_search: true, reuse_conversation: true, response_timeout_ms: 120000 }
  }
];

function workflowYaml(def) {
  const file = `examples/workflows/claude-${def.id}.yaml`;
  const inputLines = Object.entries({ backend, ...def.workflowInput }).map(([k, v]) => `      ${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n');
  const extra = def.id !== 'claude-send-basic-ext' ? '\n      tab_url_contains: "<chat_url from claude-send-basic-ext>"' : '';
  return {
    path: path.join(repo, file),
    rel: file,
    content: `id: claude-${def.id}\ntarget: claude\nprofile: ${profile}\nmode: assisted\ndescription: ${JSON.stringify(def.name)}\nsteps:\n  - use_capability: ${def.id}\n    input:\n${inputLines}${extra}\n`
  };
}

function libraryEntry(def, status, evidenceRel, workflowRel, terminal, gateResult) {
  const entry = {
    id: def.id,
    service,
    name: def.name,
    ui_location: def.ui_location,
    source,
    status,
    mcp_tool: def.mcp_tool,
    backend,
    evidence: evidenceRel,
    verified_by: verifiedBy,
    recipe_ref: workflowRel,
    sub_mcp_candidate: false,
    completion_gate: def.completion_gate,
    artifact: def.artifact,
    last_update: lastUpdate,
    notes: status === 'OK_EXT_BACKEND'
      ? `Verified live with ${backend} using profile ${profile}.`
      : `Fail-closed with ${backend} using profile ${profile}.`,
  };
  if (status !== 'OK_EXT_BACKEND') {
    const parsed = terminal?.parsed;
    entry.errorCode = parsed?.errorCode || parsed?.error_code || (terminal?.timed_out ? 'TIMEOUT' : 'GATE_FAILED');
    entry.cause = parsed?.cause || parsed?.error || terminal?.parse_error || gateResult?.details?.cause || 'completion gate not satisfied';
  }
  return entry;
}

async function runCap(def, ctx) {
  const capStart = Date.now();
  const attempts = [];
  let terminal = null;
  let gateResult = null;
  let status = 'FAIL_CLOSED_EXT_BACKEND';
  let okWord = 'fail-closed';

  if (def.precondition && !def.precondition(ctx)) {
    terminal = {
      command: commandString(def.args({ chatUrl: '<missing>' })),
      code: null,
      signal: null,
      timed_out: false,
      wall_ms: 0,
      stdout: '',
      stderr: '',
      parsed: { ok: false, errorCode: 'PRECONDITION_FAILED', error: def.preconditionCause },
      parse_error: null,
    };
    attempts.push(terminal);
    gateResult = { ok: false, details: { cause: def.preconditionCause } };
  } else {
    for (let i = 1; i <= 2; i++) {
      if (Date.now() - runStart > maxRunMs) break;
      const args = def.args(ctx);
      console.log(`[${iso()}] ${bucket}/${def.id} attempt ${i}: ${commandString(args)}`);
      const result = await runCli(args, def.timeoutMs);
      attempts.push({ attempt: i, ...result });
      terminal = result;
      const parsed = result.parsed;
      const commandOk = result.code === 0 && parsed && (parsed.ok === undefined || boolTrue(parsed.ok));
      gateResult = parsed ? def.gate(parsed) : { ok: false, details: { parse_error: result.parse_error } };
      console.log(`[${iso()}] ${bucket}/${def.id} attempt ${i} code=${result.code} wall_ms=${result.wall_ms} gate=${gateResult.ok}\n${resultSummary(parsed)}`);
      if (commandOk && gateResult.ok) {
        status = 'OK_EXT_BACKEND';
        okWord = 'ok';
        if (gateResult.chatUrl && !ctx.chatUrl) ctx.chatUrl = gateResult.chatUrl;
        break;
      }
    }
  }

  const totalWall = Date.now() - capStart;
  const evidencePath = path.join(outDir, `${def.id}.json`);
  const workflow = workflowYaml(def);
  writeFileSync(workflow.path, workflow.content);
  const evidence = {
    id: def.id,
    service,
    bucket,
    backend,
    profile,
    status,
    ok: status === 'OK_EXT_BACKEND',
    completion_gate: def.completion_gate,
    gate_result: gateResult,
    chat_url: ctx.chatUrl || null,
    attempts,
    terminal_result: terminal,
    workflow: rel(workflow.path),
    started_at: new Date(capStart).toISOString(),
    finished_at: iso(),
    wall_ms: totalWall,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  const entry = libraryEntry(def, status, rel(evidencePath), rel(workflow.path), terminal, gateResult);
  appendFileSync(libraryPath, JSON.stringify(entry) + '\n');
  appendFileSync(heartbeatPath, `${iso()} ${bucket}/${def.id} ${okWord} ${totalWall} ${rel(evidencePath)}\n`);
  return { def, status, evidencePath, workflowPath: workflow.path, gateResult, wall_ms: totalWall };
}

async function main() {
  const ctx = { chatUrl: '' };
  const results = [];
  for (const def of capDefs) {
    if (Date.now() - runStart > maxRunMs) {
      writeFileSync(blockerPath, `# ${bucket} blocker\n\nExceeded 25 minute lane budget before ${def.id}.\n`);
      process.exitCode = 2;
      return;
    }
    const result = await runCap(def, ctx);
    results.push(result);
  }
  const failures = results.filter((r) => r.status !== 'OK_EXT_BACKEND');
  const summaryPath = path.join(outDir, `${bucket}-summary.json`);
  writeFileSync(summaryPath, JSON.stringify({ bucket, service, backend, profile, chat_url: ctx.chatUrl || null, failures: failures.length, results: results.map(r => ({ id: r.def.id, status: r.status, evidence: rel(r.evidencePath), workflow: rel(r.workflowPath), wall_ms: r.wall_ms })) }, null, 2) + '\n');
  if (failures.length >= 3) {
    writeFileSync(blockerPath, `# ${bucket} blocker\n\n${failures.length} capabilities failed (threshold >= 3).\n\nFailures:\n${failures.map(f => `- ${f.def.id}: ${f.status}; evidence ${rel(f.evidencePath)}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

main().catch((err) => {
  writeFileSync(blockerPath, `# ${bucket} runner error\n\n${err?.stack || err}\n`);
  console.error(err?.stack || err);
  process.exitCode = 1;
});
