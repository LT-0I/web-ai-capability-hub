import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const RUN_DIR='.runs/capability-explore-2026-05-25/gemini';
const DOWNLOAD_DIR='/tmp/explore-2026-05-25/gemini';
const HB=path.join(RUN_DIR,'heartbeat.log');
const OUT=path.join(RUN_DIR,'gemini-deep-research-mgr.final-monitor.json');
const REPORT=path.join(DOWNLOAD_DIR,'gemini-deep-research-mgr-response.txt');
const CHAT_ID='260e7fc538aef136';
const minMtime=1779653862000; // after successful CLI queue
const deadline=Date.now()+11*60*1000;
const terms=['LangGraph','LlamaIndex','Haystack','DSPy','AutoGen','CrewAI','Agno','Pydantic AI','smolagents','Semantic Kernel','TensorZero','Letta','vLLM','SGLang','KTransformers','OpenAI Agents','Mastra','BeeAI','FastAgency','Mirascope','Instructor','PocketFlow','LangChain'];
function hb(m){fs.appendFileSync(HB,`${new Date().toISOString()} ${m}\n`)}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function info(p){const s=fs.statSync(p);return {path:p,size:s.size,mtime:s.mtimeMs,sha256:sha(p)}}
function fresh(){return fs.readdirSync(DOWNLOAD_DIR).map(n=>path.join(DOWNLOAD_DIR,n)).filter(p=>fs.statSync(p).isFile()).map(info).filter(x=>x.mtime>=minMtime&&x.size>4096&&!/\.mp3$/i.test(x.path)&&!/Gemini_Generated_Image/i.test(path.basename(x.path))).sort((a,b)=>b.mtime-a.mtime)}
function clean(s){return (s||'').replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n').replace(/[ \t]+/g,' ').trim()}
function gate(text){const lower=text.toLowerCase(); const hits=terms.filter(t=>lower.includes(t.toLowerCase())); const list=(text.match(/(^|\n)\s*(?:[-*•]|\d+[.)])\s+\S+/g)||[]).length; const researching=/researching websites|while i'm researching|researching\.\.\./i.test(text); return {ok:!researching&&(hits.length>=3||(/framework/i.test(text)&&list>=3&&text.length>500)),framework_hits:hits,list_like_count:list,response_chars:text.length,researching};}
async function extract(p){return await p.evaluate(()=>{const c=s=>(s||'').replace(/\s+\n/g,'\n').replace(/\n\s+/g,'\n').replace(/[ \t]+/g,' ').trim(); const latest=[...document.querySelectorAll('model-response')].at(-1); const body=c(document.body.innerText||''); const buttons=[...document.querySelectorAll('button,[role="button"],a')].filter(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.visibility!='hidden'&&cs.display!='none'}).map(el=>({aria:el.getAttribute('aria-label')||'',text:c(el.innerText||el.textContent||'')})); return {url:location.href,title:document.title,latest_response_text:c(latest?.innerText||latest?.textContent||''),body_tail:body.slice(-5000),buttons};})}
hb('G8 final monitor start no-click mode');
const b=await chromium.connectOverCDP('http://127.0.0.1:9225');
const p=b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes(CHAT_ID))||b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('gemini.google.com/app'));
if(!p) throw new Error('page missing');
await p.bringToFront().catch(()=>{});
let final=null,last=null,lastLog=0;
while(Date.now()<deadline){
 await p.waitForTimeout(15000);
 last=await extract(p);
 const fd=fresh()[0]; const g=gate(last.latest_response_text); const stop=await p.locator('button[aria-label*="Stop" i], button:has-text("Stop")').first().isVisible().catch(()=>false);
 if(fd){final={ok:true,gate:'fresh_download_artifact',artifact:fd,text_gate:g,latest_response_text:last.latest_response_text};break;}
 if(g.ok&&!stop){fs.writeFileSync(REPORT,last.latest_response_text);final={ok:true,gate:'response_text',artifact:info(REPORT),text_gate:g,latest_response_text:last.latest_response_text};break;}
 if(Date.now()-lastLog>30000){hb(`G8 final progress chars=${g.response_chars} hits=${g.framework_hits.join('|')||'-'} list=${g.list_like_count} researching=${g.researching} stop=${stop}`); fs.writeFileSync(OUT,JSON.stringify({ok:false,in_progress:true,gate:g,stopVisible:stop,last:{url:last.url,title:last.title,latest_response_text:last.latest_response_text,body_tail:last.body_tail},fresh_downloads:fresh()},null,2)); lastLog=Date.now();}
}
if(!final){last=last||await extract(p); const g=gate(last.latest_response_text); await p.screenshot({path:path.join(RUN_DIR,'g8-final-timeout.png'),fullPage:false}).catch(()=>{}); final={ok:false,errorCode:'COMMAND_TIMEOUT',error_code:'COMMAND_TIMEOUT',gate:g,latest_response_text:last.latest_response_text,body_tail:last.body_tail,fresh_downloads:fresh()};}
fs.writeFileSync(OUT,JSON.stringify(final,null,2)); hb(`G8 final monitor done ok=${final.ok} gate=${final.gate||final.errorCode}`); await b.close(); if(!final.ok) process.exit(1);
