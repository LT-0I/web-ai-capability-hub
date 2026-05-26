import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const outDir='.runs/postship-fix-wave-7/probes'; fs.mkdirSync(outDir,{recursive:true});
const outPath=path.join(outDir,'codex-submit.json');
const CODEX_URL='https://chatgpt.com/codex/cloud';
const envCandidates=[
  'button[aria-label="View all code environments"]',
  'button[aria-label*="environment" i]',
  'button:has-text("LT-0I/CN-")',
  'button:has-text("Environment")',
  '[role="button"]:has-text("LT-0I/CN-")'
];
const envPickCandidates=[
  'xpath=//button[normalize-space(.)="LT-0I/CN-" or .//*[normalize-space(.)="LT-0I/CN-"]]',
  'button:has-text("LT-0I/CN-")',
  '[role="option"]:has-text("LT-0I/CN-")',
  '[role="menuitem"]:has-text("LT-0I/CN-")'
];
const composerCandidates=['#prompt-textarea','textarea[placeholder*="task" i]','textarea','[contenteditable="true"]'];
const submitCandidates=[
  'button[aria-label="Submit"]',
  'button:has-text("Submit")',
  'button[aria-label*="Submit" i]',
  'button:has-text("Start task")',
  'button:has-text("Create task")',
  'button[type="submit"]'
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function closeChatgptPages(ctx){ for(const p of ctx.pages()) if(p.url().startsWith('https://chatgpt.com/c/')||p.url().startsWith(CODEX_URL)) await p.close().catch(()=>{}); }
async function collect(page, stage, extra={}){
 return await page.evaluate(({stage,extra})=>{
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const interesting=[...document.querySelectorAll('button,textarea,input,[contenteditable="true"],[role="dialog"],[role="option"],[role="menuitem"],a')].map(el=>({tag:el.tagName,role:el.getAttribute('role'),ariaLabel:el.getAttribute('aria-label'),ariaExpanded:el.getAttribute('aria-expanded'),ariaDisabled:el.getAttribute('aria-disabled'),disabled:el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.disabled : undefined,type:el.getAttribute('type'),placeholder:el.getAttribute('placeholder'),dataTestId:el.getAttribute('data-testid'),href:el.getAttribute('href'),text:clean(el.innerText||el.textContent||el.value),className:typeof el.className==='string'?el.className:'',outerHTML:el.outerHTML.slice(0,3000)})).filter(x=>/codex|environment|LT-0I|submit|task|branch|repo|prompt|start|create/i.test([x.ariaLabel,x.placeholder,x.dataTestId,x.href,x.text,x.className].join(' '))).slice(0,160);
  return {stage,extra,at:new Date().toISOString(),url:location.href,title:document.title,interesting,bodyText:clean(document.body?.innerText||'').slice(0,10000)};
 },{stage,extra});
}
async function countLoc(page, selectors){const out=[]; for(const s of selectors){const loc=page.locator(s); const n=await loc.count().catch(()=>0); let first=null; if(n){ first=await loc.first().evaluate(el=>{const clean=s=>String(s||'').replace(/\s+/g,' ').trim(); return {tag:el.tagName,role:el.getAttribute('role'),ariaLabel:el.getAttribute('aria-label'),ariaExpanded:el.getAttribute('aria-expanded'),ariaDisabled:el.getAttribute('aria-disabled'),disabled:el.disabled,type:el.getAttribute('type'),placeholder:el.getAttribute('placeholder'),text:clean(el.innerText||el.textContent||el.value),html:el.outerHTML.slice(0,3000)};}).catch(e=>({error:String(e?.message||e)}));} out.push({selector:s,count:n,first});} return out;}
async function clickFirst(page, selectors){ for(const s of selectors){ const loc=page.locator(s).first(); if(await loc.count().catch(()=>0)){ try{ await loc.click({timeout:5000}); return s; }catch{} } } return ''; }
async function fillFirst(page, selectors, value){ for(const s of selectors){ const loc=page.locator(s).first(); if(await loc.count().catch(()=>0)){ try{ await loc.fill(value,{timeout:5000}); return s; }catch{ try{ await loc.click({timeout:5000}); await page.keyboard.type(value,{delay:1}); return s;}catch{} } } } return ''; }
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx=browser.contexts()[0];
const result={probedAt:new Date().toISOString(),envCandidates,envPickCandidates,composerCandidates,submitCandidates};
let page;
try{
 await closeChatgptPages(ctx);
 page=await ctx.newPage();
 await page.goto(CODEX_URL,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
 await sleep(2500);
 result.stages=[await collect(page,'loaded')];
 result.loadedCounts={env:await countLoc(page,envCandidates),composer:await countLoc(page,composerCandidates),submit:await countLoc(page,submitCandidates)};
 const envClicked=await clickFirst(page,envCandidates);
 result.envClickedSelector=envClicked;
 await sleep(1000);
 result.stages.push(await collect(page,'env-open',{envClicked}));
 result.envOpenCounts={envPick:await countLoc(page,envPickCandidates)};
 const pickClicked=await clickFirst(page,envPickCandidates);
 result.envPickClickedSelector=pickClicked;
 await sleep(1000);
 const composerFilled=await fillFirst(page,composerCandidates,'Probe selector only — do not submit');
 result.composerSelector=composerFilled;
 await sleep(1000);
 result.stages.push(await collect(page,'after-fill',{pickClicked,composerFilled}));
 result.afterFillCounts={env:await countLoc(page,envCandidates),composer:await countLoc(page,composerCandidates),submit:await countLoc(page,submitCandidates)};
 result.recommended={envSelector:(result.loadedCounts.env.find(x=>x.count)?.selector)||null,envPickSelector:(result.envOpenCounts.envPick.find(x=>x.count)?.selector)||null,composerSelector:composerFilled||null,submitSelector:(result.afterFillCounts.submit.find(x=>x.count)?.selector)||null};
 fs.writeFileSync(outPath,JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:true,outPath,recommended:result.recommended},null,2));
}catch(e){
 result.ok=false; result.error=String(e?.stack||e); if(page) result.stages=[...(result.stages||[]),await collect(page,'error').catch(err=>({collectError:String(err)}))]; fs.writeFileSync(outPath,JSON.stringify(result,null,2)); console.error(JSON.stringify({ok:false,outPath,error:String(e?.message||e)},null,2)); process.exitCode=1;
}finally{
 await closeChatgptPages(ctx).catch(()=>{});
 if(!ctx.pages().some(p=>p.url()==='https://chatgpt.com/' || /^https:\/\/chatgpt\.com\/?(?:$|[?#])/.test(p.url()))){ const h=await ctx.newPage(); await h.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{}); }
 await browser.close().catch(()=>{});
}
