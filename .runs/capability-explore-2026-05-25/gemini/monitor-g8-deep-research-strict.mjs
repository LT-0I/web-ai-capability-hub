import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const RUN_DIR = '.runs/capability-explore-2026-05-25/gemini';
const DOWNLOAD_DIR = '/tmp/explore-2026-05-25/gemini';
const CHAT_ID = '260e7fc538aef136';
const HB = path.join(RUN_DIR, 'heartbeat.log');
const OUT = path.join(RUN_DIR, 'gemini-deep-research-mgr.monitor-strict.json');
const REPORT_TXT = path.join(DOWNLOAD_DIR, 'gemini-deep-research-mgr-response.txt');
const minMtime = Date.now();
const deadline = Date.now() + 13 * 60 * 1000;
const terms = ['LangGraph','LlamaIndex','Haystack','DSPy','AutoGen','CrewAI','Agno','Pydantic AI','smolagents','Semantic Kernel','TensorZero','Letta','vLLM','SGLang','KTransformers','OpenAI Agents','Mastra','BeeAI','FastAgency','FastMCP','Mirascope','Instructor'];
function hb(msg){fs.appendFileSync(HB, `${new Date().toISOString()} ${msg}\n`)}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function fileInfo(p){const st=fs.statSync(p); return {path:p,size:st.size,mtime:st.mtimeMs,sha256:sha256(p)}}
function freshDownloads(){return fs.readdirSync(DOWNLOAD_DIR).map(n=>path.join(DOWNLOAD_DIR,n)).filter(p=>fs.statSync(p).isFile()).map(fileInfo).filter(x=>x.mtime>=minMtime && x.size>4096 && !/\.mp3$/i.test(x.path) && !/Gemini_Generated_Image/i.test(path.basename(x.path))).sort((a,b)=>b.mtime-a.mtime)}
function clean(s){return (s||'').replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n').replace(/[ \t]+/g,' ').trim()}
function hits(text){const l=text.toLowerCase(); return terms.filter(t=>l.includes(t.toLowerCase()))}
function listCount(text){return (text.match(/(^|\n)\s*(?:[-*•]|\d+[.)])\s+\S+/g)||[]).length}
function textGate(text){const h=hits(text); const lc=listCount(text); const researching=/researching websites|while i'm researching|researching\.\.\./i.test(text); return {ok:!researching && (h.length>=3 || (/framework/i.test(text)&&lc>=3&&text.length>500)), framework_hits:h, list_like_count:lc, response_chars:text.length, researching}}
async function extract(page){return await page.evaluate(()=>{
 const c=s=>(s||'').replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n').replace(/[ \t]+/g,' ').trim();
 const responses=[...document.querySelectorAll('model-response')];
 const latest=responses.at(-1);
 const buttons=[...document.querySelectorAll('button,[role="button"],a')].filter(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'}).map(el=>({aria:el.getAttribute('aria-label')||'',text:c(el.innerText||el.textContent||''),href:el.getAttribute('href')||''}));
 return {url:location.href,title:document.title,latest_response_text: latest ? c(latest.innerText||latest.textContent||'') : '', body_tail:c(document.body.innerText||'').slice(-4000), buttons};
})}
async function clickStartIfPresent(page){
 const locs=await page.locator('button,[role="button"],a').all();
 for(const loc of locs){
  if(!await loc.isVisible().catch(()=>false)) continue;
  const aria=await loc.getAttribute('aria-label').catch(()=>'')||'';
  const text=clean(await loc.innerText().catch(()=>'')||'');
  if(/start research|start researching|begin research|run research/i.test(`${aria} ${text}`)) { await loc.click({force:true,timeout:5000}).catch(()=>{}); hb(`strict clicked start: ${`${aria} ${text}`.slice(0,120)}`); return true; }
 }
 return false;
}
async function clickReportDownloadIfPresent(page){
 const locs=await page.locator('button,[role="button"],a').all();
 for(const loc of locs){
  if(!await loc.isVisible().catch(()=>false)) continue;
  const aria=await loc.getAttribute('aria-label').catch(()=>'')||'';
  const text=clean(await loc.innerText().catch(()=>'')||'');
  const hay=`${aria} ${text}`;
  if(/download/i.test(hay) && /report|pdf|docx|word|markdown|md/i.test(hay) && !/image|track|music|video/i.test(hay)) { await loc.click({force:true,timeout:5000}).catch(()=>{}); hb(`strict clicked report-download: ${hay.slice(0,120)}`); return true; }
 }
 return false;
}

hb(`G8 strict monitor start minMtime=${minMtime}`);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9225');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes(CHAT_ID)) || browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('gemini.google.com/app'));
if(!page) throw new Error('Gemini target page not found');
await page.bringToFront().catch(()=>{});
let final=null, last=null, lastLog=0;
while(Date.now()<deadline){
 await page.waitForTimeout(10000);
 last=await extract(page);
 await clickStartIfPresent(page);
 await clickReportDownloadIfPresent(page);
 await page.waitForTimeout(1000);
 const fd=freshDownloads()[0];
 const gate=textGate(last.latest_response_text);
 const stopVisible=await page.locator('button[aria-label*="Stop" i], button:has-text("Stop")').first().isVisible().catch(()=>false);
 if(fd){ final={ok:true,gate:'fresh_download_artifact',artifact:fd,text_gate:gate,latest_response_text:last.latest_response_text}; break; }
 if(gate.ok && !stopVisible){ fs.writeFileSync(REPORT_TXT,last.latest_response_text); final={ok:true,gate:'response_text',artifact:fileInfo(REPORT_TXT),text_gate:gate,latest_response_text:last.latest_response_text}; break; }
 if(Date.now()-lastLog>30000){ hb(`G8 strict progress chars=${gate.response_chars} hits=${gate.framework_hits.join('|')||'-'} list=${gate.list_like_count} researching=${gate.researching} stop=${stopVisible}`); fs.writeFileSync(OUT, JSON.stringify({ok:false,in_progress:true,gate,stopVisible,last:{url:last.url,title:last.title,latest_response_text:last.latest_response_text,body_tail:last.body_tail},fresh_downloads:freshDownloads()},null,2)); lastLog=Date.now(); }
}
if(!final){ last=last||await extract(page); const gate=textGate(last.latest_response_text); await page.screenshot({path:path.join(RUN_DIR,'g8-strict-timeout.png'),fullPage:false}).catch(()=>{}); final={ok:false,errorCode:'COMMAND_TIMEOUT',error_code:'COMMAND_TIMEOUT',gate,latest_response_text:last.latest_response_text,body_tail:last.body_tail,fresh_downloads:freshDownloads()}; }
fs.writeFileSync(OUT, JSON.stringify(final,null,2));
hb(`G8 strict monitor done ok=${final.ok} gate=${final.gate||final.errorCode}`);
await browser.close();
if(!final.ok) process.exit(1);
