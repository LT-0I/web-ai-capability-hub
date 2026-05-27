const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.cwd();
const runDir = path.resolve(root, '.runs/wave-18-optica');
const outDir = path.join(runDir, 'downloads', 'optica-resmoke');
fs.mkdirSync(outDir, { recursive: true });
const profilesPath = path.resolve(root, 'data/browser-profiles/profiles.json');
const backupPath = path.join(runDir, 'profiles.pre-resmoke.json');
fs.copyFileSync(profilesPath, backupPath);
function chromePids() {
  const res = cp.spawnSync('bash', ['-lc', 'pgrep -af "(/opt/google/chrome/chrome|google-chrome).*research-optica" || true'], { encoding: 'utf8' });
  return new Map((res.stdout || '').trim().split('\n').filter(Boolean).map((line) => {
    const first = line.trim().split(/\s+/, 1)[0];
    return [first, line];
  }));
}
const beforePids = chromePids();
const command = [
  'node', 'dist/src/cli.js', 'webai:optica:download-pdf',
  '--doc-id', 'optica:ol-51-10-2872',
  '--output-dir', outDir,
  '--profile', 'research-optica',
  '--output-json'
];
const started = Date.now();
const run = cp.spawnSync('timeout', ['120', ...command], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const durationMs = Date.now() - started;
const afterPids = chromePids();
for (const pid of afterPids.keys()) {
  if (!beforePids.has(pid) && Number(pid) > 0) {
    cp.spawnSync('bash', ['-lc', `kill -- -${pid} 2>/dev/null || kill ${pid} 2>/dev/null || true`]);
  }
}
cp.spawnSync('sleep', ['1']);
for (const pid of afterPids.keys()) {
  if (!beforePids.has(pid) && Number(pid) > 0) {
    cp.spawnSync('bash', ['-lc', `kill -9 -- -${pid} 2>/dev/null || kill -9 ${pid} 2>/dev/null || true`]);
  }
}
fs.copyFileSync(backupPath, profilesPath);
for (const keep of [
  'data/browser-profiles/research-optica/BrowserMetrics/.keep',
  'data/browser-profiles/research-asce/BrowserMetrics/.keep',
  'data/browser-profiles/research-royalsoc/BrowserMetrics/.keep',
  'data/browser-profiles/research-sae/BrowserMetrics/.keep'
]) {
  cp.spawnSync('git', ['checkout', '--', keep], { cwd: root });
}
let parsed = null;
try { parsed = JSON.parse((run.stdout || '').trim()); } catch {}
let pdfMagic = null;
if (parsed?.path && fs.existsSync(parsed.path)) {
  pdfMagic = fs.readFileSync(parsed.path).subarray(0, 5).toString('utf8');
}
const result = {
  db: 'optica',
  profile: 'research-optica',
  doc_id: 'optica:ol-51-10-2872',
  command,
  output_dir: outDir,
  started_at: new Date(started).toISOString(),
  duration_ms: durationMs,
  exit_status: run.status,
  signal: run.signal,
  timed_out: run.status === 124,
  stdout: run.stdout,
  stderr: run.stderr,
  parsed,
  ok: parsed?.ok ?? false,
  errorCode: parsed?.errorCode ?? null,
  message: parsed?.message ?? null,
  path: parsed?.path ?? null,
  sha256: parsed?.sha256 ?? null,
  size: parsed?.size ?? null,
  pdf_magic: pdfMagic,
  gate: pdfMagic === '%PDF-' ? 'PASS_PDF' : 'FAIL_LOGIN_REQUIRED_OR_CAPTCHA',
  before_pids: Object.fromEntries(beforePids),
  after_pids: Object.fromEntries(afterPids),
  killed_new_pids: [...afterPids.keys()].filter((pid) => !beforePids.has(pid)),
  captured_at: new Date().toISOString()
};
fs.writeFileSync(path.join(runDir, 'optica-resmoke.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ exit_status: result.exit_status, gate: result.gate, ok: result.ok, errorCode: result.errorCode, message: result.message, pdf_magic: result.pdf_magic, path: result.path }, null, 2));
