#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const campaign = 'capability-explore-2026-05-25';
const service = 'claude';
const bucket = 'L4';
const outDir = path.join(repo, '.runs', campaign, service);
const downloadDir = '/tmp/explore-2026-05-25/claude';
const heartbeatPath = path.join(outDir, 'heartbeat.log');
const libraryPath = path.join(outDir, 'library-additions.jsonl');
const blockerPath = path.join(outDir, `${bucket}-blocker.md`);
const backend = 'extension-assisted-cdp';
const profile = 'claude-9224';
const verifiedBy = 'codex-bucket-L4';
const source = 'L4';
const lastUpdate = new Date().toISOString().slice(0, 10);
const runStart = Date.now();
const maxRunMs = 25 * 60 * 1000;

mkdirSync(outDir, { recursive: true });
mkdirSync(downloadDir, { recursive: true });
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
function artifactPath(parsed) {
  return textOf(pick(parsed, ['path', 'savedPath', 'saved_path', 'file_path', 'filepath', 'artifact_path', 'artifactPath'])).trim();
}
function artifactMeta(parsed, gateResult, def) {
  const p = artifactPath(parsed || {});
  let stat = null;
  if (p && existsSync(p)) stat = statSync(p);
  return {
    class: 'document',
    expected_extension: def.expected_extension,
    path: p || null,
    download_filename: textOf(pick(parsed, ['download_filename', 'downloadFilename', 'artifact_name', 'suggested_filename'])) || (p ? path.basename(p) : null),
    size_bytes: Number(pick(parsed, ['size_bytes', 'sizeBytes', 'size']) || stat?.size || 0),
    sha256: textOf(pick(parsed, ['sha256'])) || null,
    gate: gateResult || null
  };
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
    id: 'claude-generate-file-docx-ext',
    name: 'Claude generate downloadable Word document via extension-assisted CDP',
    ui_location: 'Claude main chat composer → document artifact/file card → Download',
    expected_extension: 'docx',
    prompt: "Write a one-page Word document titled 'Claude Capability Probe Docx' with 3 short paragraphs about quantum computing. Deliver as a downloadable .docx file.",
    min_size: 4096,
    completion_gate: 'path non-empty + file exists + size_bytes > 4096 + filename ends with .docx'
  },
  {
    id: 'claude-generate-file-pptx-ext',
    name: 'Claude generate downloadable PowerPoint presentation via extension-assisted CDP',
    ui_location: 'Claude main chat composer → presentation artifact/file card → Download',
    expected_extension: 'pptx',
    prompt: 'Create a 5-slide pptx presentation about renewable energy basics. Deliver as a downloadable .pptx.',
    min_size: 8192,
    completion_gate: 'path non-empty + file exists + size_bytes > 8192 + filename ends with .pptx'
  }
];

function argsFor(def) {
  return ['node', 'dist/src/cli.js', 'webai:claude:generate-file', '--profile', profile, '--backend', backend, '--prompt', def.prompt, '--expected-extension', def.expected_extension, '--download-dir', downloadDir, '--artifact-class', 'document', '--json'];
}
function gate(def, parsed) {
  const p = artifactPath(parsed || {});
  const exists = Boolean(p && existsSync(p));
  const size = exists ? statSync(p).size : Number(pick(parsed, ['size_bytes', 'sizeBytes', 'size']) || 0);
  const hasExpectedExt = p ? p.toLowerCase().endsWith(`.${def.expected_extension.toLowerCase()}`) : false;
  return {
    ok: Boolean(p) && exists && size > def.min_size && hasExpectedExt,
    details: {
      path_nonempty: Boolean(p),
      file_exists: exists,
      size_bytes: size,
      min_size_exclusive: def.min_size,
      expected_extension: def.expected_extension,
      extension_matches: hasExpectedExt
    },
    artifact_path: p || null,
    download_filename: p ? path.basename(p) : null,
    size_bytes: size
  };
}
function workflowYaml(def) {
  const file = `examples/workflows/claude-${def.id}.yaml`;
  return {
    path: path.join(repo, file),
    rel: file,
    content: `# Generated by capability-explore-2026-05-25 ${bucket}\nid: claude-${def.id}\nservice: claude\ncapability_id: ${def.id}\nmode: assisted\nbackend: ${backend}\nprofile: ${profile}\ninputs:\n  prompt: ${JSON.stringify(def.prompt)}\n  expected_extension: ${def.expected_extension}\n  download_dir: ${downloadDir}\n  artifact_class: document\nsteps:\n  - name: Generate a downloadable .${def.expected_extension} file in Claude\n    command:\n      - "node"\n      - "dist/src/cli.js"\n      - "webai:claude:generate-file"\n      - "--profile"\n      - "${profile}"\n      - "--backend"\n      - "${backend}"\n      - "--prompt"\n      - ${JSON.stringify(def.prompt)}\n      - "--expected-extension"\n      - "${def.expected_extension}"\n      - "--download-dir"\n      - "${downloadDir}"\n      - "--artifact-class"\n      - "document"\n      - "--json"\nsuccess_gate: ${def.completion_gate}\nevidence: .runs/capability-explore-2026-05-25/claude/${def.id}.json\n`
  };
}
function libraryEntry(def, status, evidenceRel, workflowRel, terminal, gateResult) {
  const parsed = terminal?.parsed || {};
  const entry = {
    id: def.id,
    service,
    name: def.name,
    ui_location: def.ui_location,
    source,
    status,
    mcp_tool: 'webai_claude_generate_file',
    backend,
    evidence: evidenceRel,
    verified_by: verifiedBy,
    recipe_ref: workflowRel,
    sub_mcp_candidate: false,
    completion_gate: def.completion_gate,
    last_update: lastUpdate,
    artifact: artifactMeta(parsed, gateResult, def),
    notes: status === 'OK_EXT_BACKEND'
      ? `Verified live with ${backend} using profile ${profile}.`
      : `Fail-closed with ${backend} using profile ${profile}.`
  };
  if (status !== 'OK_EXT_BACKEND') {
    entry.errorCode = parsed?.errorCode || parsed?.error_code || (terminal?.timed_out ? 'TIMEOUT' : 'GATE_FAILED');
    entry.cause = parsed?.message || parsed?.error || terminal?.parse_error || 'completion gate not satisfied';
  }
  return entry;
}

async function runCap(def) {
  const capStart = Date.now();
  const attempts = [];
  let terminal = null;
  let gateResult = null;
  let status = 'FAIL_CLOSED_EXT_BACKEND';
  let okWord = 'fail-closed';
  const timeoutMs = Math.min(12 * 60 * 1000, Math.max(1000, maxRunMs - (Date.now() - runStart)));
  const args = argsFor(def);
  console.log(`[${iso()}] ${bucket}/${def.id}: ${commandString(args)}`);
  const result = await runCli(args, timeoutMs);
  attempts.push({ attempt: 1, ...result });
  terminal = result;
  gateResult = result.parsed ? gate(def, result.parsed) : { ok: false, details: { parse_error: result.parse_error }, artifact_path: null, size_bytes: 0 };
  console.log(`[${iso()}] ${bucket}/${def.id} code=${result.code} wall_ms=${result.wall_ms} gate=${gateResult.ok} path=${gateResult.artifact_path || ''} size=${gateResult.size_bytes || 0}`);
  if (result.code === 0 && result.parsed && gateResult.ok) {
    status = 'OK_EXT_BACKEND';
    okWord = 'ok';
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
    command: commandString(args),
    completion_gate: def.completion_gate,
    gate_result: gateResult,
    artifact: artifactMeta(terminal?.parsed || {}, gateResult, def),
    attempts,
    terminal_result: terminal,
    workflow: rel(workflow.path),
    started_at: new Date(capStart).toISOString(),
    finished_at: iso(),
    wall_ms: totalWall
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  appendFileSync(libraryPath, JSON.stringify(libraryEntry(def, status, rel(evidencePath), rel(workflow.path), terminal, gateResult)) + '\n');
  appendFileSync(heartbeatPath, `${iso()} ${bucket}/${def.id} ${okWord} ${totalWall} ${rel(evidencePath)}\n`);
  return { def, status, evidencePath, workflowPath: workflow.path, gateResult, wall_ms: totalWall };
}

async function main() {
  appendFileSync(heartbeatPath, `${iso()} ${bucket} runner-start\n`);
  const results = [];
  for (const def of capDefs) {
    if (Date.now() - runStart > maxRunMs) {
      writeFileSync(blockerPath, `# ${bucket} blocker\n\nExceeded 25 minute lane budget before ${def.id}.\n`);
      process.exitCode = 2;
      return;
    }
    results.push(await runCap(def));
  }
  const failures = results.filter((r) => r.status !== 'OK_EXT_BACKEND');
  const summaryPath = path.join(outDir, `${bucket}-summary.json`);
  writeFileSync(summaryPath, JSON.stringify({
    bucket,
    service,
    backend,
    profile,
    failures: failures.length,
    results: results.map((r) => ({
      id: r.def.id,
      status: r.status,
      evidence: rel(r.evidencePath),
      workflow: rel(r.workflowPath),
      artifact_path: r.gateResult?.artifact_path || null,
      size_bytes: r.gateResult?.size_bytes || 0,
      wall_ms: r.wall_ms
    }))
  }, null, 2) + '\n');
  appendFileSync(heartbeatPath, `${iso()} ${bucket} runner-finished failures=${failures.length} summary=${rel(summaryPath)}\n`);
  if (failures.length >= capDefs.length) {
    writeFileSync(blockerPath, `# ${bucket} blocker\n\n${failures.length}/${capDefs.length} capabilities failed.\n\nFailures:\n${failures.map(f => `- ${f.def.id}: ${f.status}; evidence ${rel(f.evidencePath)}`).join('\n')}\n`);
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
