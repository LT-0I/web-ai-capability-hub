const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const runDir = path.join(root, '.runs', 'wave-13');
const home = process.env.HOME || '';
const invalid = new Set(['dblp', 'wos']);
function normalizePath(file) { return typeof file === 'string' ? file.replace(/^<home>/, home) : file; }
function pdfMagic(file) { try { return fs.readFileSync(normalizePath(file)).subarray(0, 5).toString(); } catch { return null; } }
function stripAnsi(s) { return String(s || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, ''); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
let base = readJson(path.join(runDir, 'smoke-results.json'));
if (!Array.isArray(base)) base = base.results || [];
const byDb = new Map(base.map((r) => [r.db, { ...r, source_run: 'initial' }]));
const retryDir = path.join(runDir, 'retries');
if (fs.existsSync(retryDir)) {
  for (const name of fs.readdirSync(retryDir).sort()) {
    if (!name.endsWith('.json')) continue;
    const r = readJson(path.join(retryDir, name));
    byDb.set(r.db, { ...r, source_run: 'retry' });
  }
}
function finalClassification(r) {
  if (r.ok && (!r.path || pdfMagic(r.path) === '%PDF-')) return 'GREEN';
  return r.classification || r.errorCode || 'FAIL_UNKNOWN';
}
const rows = [...byDb.values()].sort((a, b) => a.db.localeCompare(b.db)).map((r) => {
  const pathValue = normalizePath(r.path || r.output?.path || null);
  return {
    db: r.db,
    kind: r.kind,
    publisher: r.publisher,
    profile: r.profile || null,
    doc_id: r.doc_id,
    pdf_url: r.pdf_url || null,
    result: finalClassification({ ...r, path: pathValue }),
    ok: Boolean(r.ok),
    errorCode: r.errorCode || null,
    message: stripAnsi(r.message || ''),
    path: pathValue,
    sha256: r.sha256 || null,
    size: r.size || null,
    downloaded_at: r.downloaded_at || null,
    duration_ms: r.duration_ms || null,
    exit_status: r.exit_status ?? null,
    signal: r.signal || null,
    source_run: r.source_run,
    source: r.source || null,
    pdf_magic: pathValue ? pdfMagic(pathValue) : (r.pdf_magic || null)
  };
});
const real = rows.filter((r) => !invalid.has(r.db));
const realGreen = real.filter((r) => r.result === 'GREEN');
const invalidExpected = rows.filter((r) => invalid.has(r.db) && r.result === 'INVALID_ARGS_EXPECTED');
fs.writeFileSync(path.join(runDir, 'smoke-results-final.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  real_green: realGreen.length,
  real_total: real.length,
  invalid_args_expected: invalidExpected.length,
  invalid_args_total: invalid.size,
  results: rows
}, null, 2) + '\n');
function mdCell(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').slice(0, 220); }
const lines = [
  '# Wave 13 live smoke matrix',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Real DB GREEN: ${realGreen.length}/${real.length}`,
  `INVALID_ARGS expected: ${invalidExpected.length}/${invalid.size}`,
  '',
  '| DB | Kind | Profile | Result | Error | Size | Source | Message |',
  '|---|---|---|---|---|---:|---|---|',
  ...rows.map((r) => `| ${r.db} | ${r.kind || ''} | ${r.profile || ''} | ${r.result} | ${r.errorCode || ''} | ${r.size || ''} | ${r.source_run} | ${mdCell(r.message)} |`),
  '',
  '## GREEN real DBs',
  '',
  realGreen.map((r) => `
- ${r.db}: ${r.size || ''} bytes${r.sha256 ? `, sha256 ${r.sha256}` : ''}`).join(''),
  '',
  '## Permanent-deferred candidates',
  '',
  ...real.filter((r) => r.result !== 'GREEN').map((r) => `- ${r.db}: ${r.result}${r.errorCode ? ` (${r.errorCode})` : ''} — ${mdCell(r.message || 'see result JSON')}`)
];
fs.writeFileSync(path.join(runDir, 'smoke-matrix.md'), lines.join('\n') + '\n');
console.log(`final real GREEN ${realGreen.length}/${real.length}; invalid expected ${invalidExpected.length}/${invalid.size}`);
