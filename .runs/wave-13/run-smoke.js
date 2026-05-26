const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const runDir = path.join(root, '.runs', 'wave-13');
const outDir = path.join(runDir, 'downloads');
const resultDir = path.join(runDir, 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(resultDir, { recursive: true });
let catalog = JSON.parse(fs.readFileSync(path.join(runDir, 'test-dois.json'), 'utf8'));
if (process.env.W13_ONLY) {
  const wanted = new Set(process.env.W13_ONLY.split(',').map(s => s.trim()).filter(Boolean));
  catalog = catalog.filter(row => wanted.has(row.db));
}
const sleepMs = Number(process.env.W13_SLEEP_MS || 10000);
const samePublisherMs = Number(process.env.W13_SAME_PUBLISHER_MS || 60000);
const rateLimitMs = Number(process.env.W13_RATE_LIMIT_MS || 300000);
const timeoutMs = Number(process.env.W13_TIMEOUT_MS || 140000);
const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
const publisherLast = new Map();
const publisher429 = new Map();
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function jsonFrom(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
function normalizePath(file) {
  return typeof file === 'string' ? file.replace(/^<home>/, process.env.HOME || '') : file;
}
function pdfMagic(file) {
  try { return fs.readFileSync(normalizePath(file)).subarray(0, 5).toString(); } catch { return null; }
}
function classify(rec, parsed, raw, timedOut) {
  const hay = `${raw.stdout || ''}\n${raw.stderr || ''}\n${parsed?.message || ''}`;
  if (rec.kind === 'invalid_args_expected') {
    return parsed?.errorCode === rec.expected_error ? 'INVALID_ARGS_EXPECTED' : 'INVALID_ARGS_UNEXPECTED';
  }
  if (timedOut) return 'TIMEOUT';
  if (parsed?.ok && (!parsed?.path || pdfMagic(parsed.path) === '%PDF-')) return 'GREEN';
  const code = parsed?.errorCode || 'UNKNOWN';
  if (/429|rate.?limit|too many requests/i.test(hay)) return 'DEFERRED_RATE_LIMIT';
  if (code === 'PROFILE_NOT_FOUND') return 'NO_AUTH';
  if (/\b(401|403|418)\b|forbidden|unauthori[sz]ed|access denied|cookieAbsent|cookies_not_supported|login|sign in|institution|captcha|bot|akamai|cloudflare/i.test(hay)) return 'NO_AUTH';
  if (code === 'ELEMENT_NOT_FOUND') return 'SELECTOR_DRIFT';
  if (/\b404\b|not found|did not produce a PDF|non-pdf|text\/html|application\/xml/i.test(hay)) return 'URL_RESOLVE_FAIL';
  if (code === 'ARTIFACT_DOWNLOAD_TIMEOUT') return 'URL_RESOLVE_FAIL';
  if (code === 'ARTIFACT_VERIFICATION_FAILED') return 'URL_RESOLVE_FAIL';
  return `FAIL_${code}`;
}
function commandFor(rec) {
  const args = ['dist/src/cli.js', `webai:${rec.db}:download-pdf`, '--doc-id', rec.doc_id, '--output-dir', path.join(outDir, rec.db), '--output-json'];
  if (rec.pdf_url) args.push('--pdf-url', rec.pdf_url);
  if (rec.profile) args.push('--profile', rec.profile);
  return args;
}
function closeProfile(profile) {
  if (!profile) return null;
  const cp = spawnSync('node', ['dist/src/cli.js', 'browser:close', '--profile', profile, '--mode', 'close-process', '--force', '--release-lease', '--json'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024
  });
  return { status: cp.status, signal: cp.signal, stdout: cp.stdout, stderr: cp.stderr, error: cp.error?.message || null };
}
function rowMarkdown(r) {
  return `| ${r.db} | ${r.kind} | ${r.profile || ''} | ${r.classification} | ${r.errorCode || ''} | ${r.size || ''} | ${r.duration_ms} | ${String(r.message || '').replace(/\|/g, '\\|').slice(0, 180)} |`;
}
(async () => {
  const results = [];
  for (let i = 0; i < catalog.length; i++) {
    const rec = catalog[i];
    if (i > 0) await sleep(sleepMs);
    const last = publisherLast.get(rec.publisher);
    if (last) {
      const elapsed = Date.now() - last;
      if (elapsed < samePublisherMs) await sleep(samePublisherMs - elapsed);
    }
    const start = Date.now();
    const args = commandFor(rec);
    console.log(`[${new Date().toISOString()}] smoke ${rec.db}: node ${args.map(a => JSON.stringify(a)).join(' ')}`);
    fs.mkdirSync(path.join(outDir, rec.db), { recursive: true });
    const cp = spawnSync('node', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024
    });
    const duration = Date.now() - start;
    const timedOut = Boolean(cp.error && /timed out|ETIMEDOUT/i.test(cp.error.message || '')) || cp.signal === 'SIGTERM';
    const parsed = jsonFrom(cp.stdout) || jsonFrom(cp.stderr) || {};
    const classification = classify(rec, parsed, { stdout: cp.stdout, stderr: cp.stderr }, timedOut);
    if (classification === 'DEFERRED_RATE_LIMIT') {
      publisher429.set(rec.publisher, (publisher429.get(rec.publisher) || 0) + 1);
    } else {
      publisher429.set(rec.publisher, 0);
    }
    const result = {
      db: rec.db,
      kind: rec.kind,
      profile: rec.profile || null,
      publisher: rec.publisher,
      doc_id: rec.doc_id,
      pdf_url: rec.pdf_url || null,
      classification,
      ok: Boolean(parsed.ok),
      errorCode: parsed.errorCode || null,
      message: parsed.message || null,
      path: parsed.path || null,
      sha256: parsed.sha256 || null,
      size: parsed.size || null,
      downloaded_at: parsed.downloaded_at || null,
      duration_ms: duration,
      exit_status: cp.status,
      signal: cp.signal || null,
      spawn_error: cp.error?.message || null,
      stdout: cp.stdout,
      stderr: cp.stderr,
      source: rec.source,
      pdf_magic: parsed.path ? pdfMagic(parsed.path) : null
    };
    result.close = closeProfile(rec.profile);
    publisherLast.set(rec.publisher, Date.now());
    fs.writeFileSync(path.join(resultDir, `${rec.db}.json`), JSON.stringify(result, null, 2));
    results.push(result);
    fs.writeFileSync(path.join(runDir, 'smoke-results.json'), JSON.stringify(results, null, 2));
    const real = results.filter(r => r.kind !== 'invalid_args_expected');
    const green = real.filter(r => r.classification === 'GREEN').length;
    console.log(`[${new Date().toISOString()}] ${rec.db} => ${classification}; cumulative real GREEN ${green}/${real.length}`);
    if (classification === 'DEFERRED_RATE_LIMIT') {
      console.log(`[${new Date().toISOString()}] rate-limit hygiene pause ${rateLimitMs}ms for ${rec.publisher}`);
      await sleep(rateLimitMs);
    }
  }
  const real = results.filter(r => r.kind !== 'invalid_args_expected');
  const green = real.filter(r => r.classification === 'GREEN').length;
  const invalid = results.filter(r => r.kind === 'invalid_args_expected' && r.classification === 'INVALID_ARGS_EXPECTED').length;
  const lines = [
    '# Wave 13 live smoke matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Real DB GREEN: ${green}/${real.length}`,
    `INVALID_ARGS expected: ${invalid}/2`,
    '',
    '| DB | Kind | Profile | Result | Error | Size | Duration ms | Message |',
    '|---|---|---|---|---|---:|---:|---|',
    ...results.map(rowMarkdown),
    '',
    '## Permanent-deferred candidates',
    '',
    ...results.filter(r => r.kind !== 'invalid_args_expected' && r.classification !== 'GREEN').map(r => `- ${r.db}: ${r.classification}${r.errorCode ? ` (${r.errorCode})` : ''} — ${r.message || 'see result JSON'}`)
  ];
  fs.writeFileSync(path.join(runDir, 'smoke-matrix.md'), lines.join('\n') + '\n');
  console.log(`[${new Date().toISOString()}] DONE real GREEN ${green}/${real.length}; invalid expected ${invalid}/2`);
})();
