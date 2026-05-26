const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const runDir = path.join(root, '.runs', 'wave-13');
const outDir = path.join(runDir, 'downloads');
const retryDir = path.join(runDir, 'retries');
fs.mkdirSync(retryDir, { recursive: true });
const wanted = new Set((process.env.W13_ONLY || '').split(',').map(s => s.trim()).filter(Boolean));
const catalog = JSON.parse(fs.readFileSync(path.join(runDir, 'test-dois.json'), 'utf8')).filter(r => wanted.size ? wanted.has(r.db) : true);
const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function normalizePath(file) { return typeof file === 'string' ? file.replace(/^<home>/, process.env.HOME || '') : file; }
function pdfMagic(file) { try { return fs.readFileSync(normalizePath(file)).subarray(0,5).toString(); } catch { return null; } }
function jsonFrom(text) { const s=String(text||''); const a=s.indexOf('{'), b=s.lastIndexOf('}'); if(a<0||b<a) return {}; try{return JSON.parse(s.slice(a,b+1));}catch{return {};}}
function classify(rec, parsed, stdout, stderr, timedOut) {
  const hay = `${stdout}\n${stderr}\n${parsed.message||''}`;
  if (rec.kind === 'invalid_args_expected') return parsed.errorCode === rec.expected_error ? 'INVALID_ARGS_EXPECTED' : 'INVALID_ARGS_UNEXPECTED';
  if (timedOut) return 'TIMEOUT';
  if (parsed.ok && (!parsed.path || pdfMagic(parsed.path) === '%PDF-')) return 'GREEN';
  if (/429|rate.?limit|too many requests/i.test(hay)) return 'DEFERRED_RATE_LIMIT';
  if (parsed.errorCode === 'PROFILE_NOT_FOUND') return 'NO_AUTH';
  if (/\b(401|403|418)\b|forbidden|unauthori[sz]ed|access denied|cookieAbsent|cookies_not_supported|login|sign in|institution|captcha|bot|akamai|cloudflare/i.test(hay)) return 'NO_AUTH';
  if (parsed.errorCode === 'ELEMENT_NOT_FOUND') return 'SELECTOR_DRIFT';
  if (/\b404\b|not found|did not produce a PDF|non-pdf|text\/html|application\/xml/i.test(hay)) return 'URL_RESOLVE_FAIL';
  if (parsed.errorCode === 'ARTIFACT_DOWNLOAD_TIMEOUT' || parsed.errorCode === 'ARTIFACT_VERIFICATION_FAILED') return 'URL_RESOLVE_FAIL';
  return `FAIL_${parsed.errorCode || 'UNKNOWN'}`;
}
function closeProfile(profile) { if(!profile) return null; return spawnSync('node',['dist/src/cli.js','browser:close','--profile',profile,'--mode','close-process','--force','--release-lease','--json'],{cwd:root,env,encoding:'utf8',timeout:30000,maxBuffer:2e6}); }
(async()=>{
  const results=[];
  const lastPub = new Map();
  for (let i=0;i<catalog.length;i++) {
    const rec=catalog[i];
    if (i) await sleep(10000);
    const last=lastPub.get(rec.publisher); if (last && Date.now()-last < 60000) await sleep(60000-(Date.now()-last));
    const args=['dist/src/cli.js',`webai:${rec.db}:download-pdf`,'--doc-id',rec.doc_id,'--output-dir',path.join(outDir, rec.db),'--output-json'];
    if(rec.pdf_url) args.push('--pdf-url',rec.pdf_url); if(rec.profile) args.push('--profile',rec.profile);
    console.log(`[${new Date().toISOString()}] retry ${rec.db}`);
    const started=Date.now();
    const cp=spawnSync('node',args,{cwd:root,env,encoding:'utf8',timeout:Number(process.env.W13_TIMEOUT_MS||140000),maxBuffer:20*1024*1024});
    const parsed=jsonFrom(cp.stdout)||jsonFrom(cp.stderr)||{};
    const timedOut=Boolean(cp.error&&/timed out|ETIMEDOUT/i.test(cp.error.message||''))||cp.signal==='SIGTERM';
    const result={db:rec.db,kind:rec.kind,profile:rec.profile||null,publisher:rec.publisher,doc_id:rec.doc_id,pdf_url:rec.pdf_url||null,classification:classify(rec,parsed,cp.stdout,cp.stderr,timedOut),ok:!!parsed.ok,errorCode:parsed.errorCode||null,message:parsed.message||null,path:parsed.path?normalizePath(parsed.path):null,sha256:parsed.sha256||null,size:parsed.size||null,downloaded_at:parsed.downloaded_at||null,duration_ms:Date.now()-started,exit_status:cp.status,signal:cp.signal||null,spawn_error:cp.error?.message||null,stdout:cp.stdout,stderr:cp.stderr,source:rec.source,pdf_magic:parsed.path?pdfMagic(parsed.path):null};
    const closed=closeProfile(rec.profile); result.close={status:closed?.status??null,signal:closed?.signal??null,stdout:closed?.stdout||'',stderr:closed?.stderr||'',error:closed?.error?.message||null};
    lastPub.set(rec.publisher, Date.now());
    fs.writeFileSync(path.join(retryDir, `${rec.db}.json`), JSON.stringify(result,null,2));
    results.push(result); fs.writeFileSync(path.join(runDir,'retry-results.json'), JSON.stringify(results,null,2));
    console.log(`[${new Date().toISOString()}] ${rec.db} => ${result.classification} ${result.size||''}`);
  }
})();
