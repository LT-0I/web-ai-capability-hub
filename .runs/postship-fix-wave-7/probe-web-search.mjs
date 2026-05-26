import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const outDir='.runs/postship-fix-wave-7/probes'; fs.mkdirSync(outDir,{recursive:true});
const outPath=path.join(outDir,'web-search.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const candidates=[
  '[role="menuitemradio"]:has-text("Web search")',
  '[role="menuitemradio"]:has-text("Search")',
  '[role="menuitemcheckbox"]:has-text("Web search")',
  '[role="menuitemcheckbox"]:has-text("Search")',
  '[role="menuitem"]:has-text("Web search")',
  '[role="menuitem"]:has-text("Search")',
  'button:has-text("Web search")',
  'button:has-text("Search")',
  '[data-testid*="search" i]'
];
const activeCandidates=[
  'button[aria-label="Search, click to remove"]',
  'button[aria-label*="Search" i][aria-label*="remove" i]',
  'button[aria-label*="web" i][aria-label*="remove" i]',
  'form button:has-text("Search")',
  '#composer-background button:has-text("Search")'
];
async function closeConversationTabs(ctx){ for(const p of ctx.pages()) if(p.url().startsWith('https://chatgpt.com/c/')) await p.close().catch(()=>{}); }
async function collect(page, stage, clickedSelector=''){
  return await page.evaluate(({candidates,activeCandidates,stage,clickedSelector})=>{
    const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
    const countFor=s=>{try{const nodes=[...document.querySelectorAll(s)]; return {selector:s,count:nodes.length,first:nodes[0]?{tag:nodes[0].tagName,role:nodes[0].getAttribute('role'),ariaLabel:nodes[0].getAttribute('aria-label'),ariaChecked:nodes[0].getAttribute('aria-checked'),dataTestId:nodes[0].getAttribute('data-testid'),text:clean(nodes[0].innerText||nodes[0].textContent),className:typeof nodes[0].className==='string'?nodes[0].className:'',outerHTML:nodes[0].outerHTML.slice(0,4000)}:null};}catch(e){return {selector:s,count:0,error:String(e?.message||e)}}};
    const menuish=[...document.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], [role="option"], [data-radix-collection-item], button')].map(el=>({tag:el.tagName,role:el.getAttribute('role'),ariaLabel:el.getAttribute('aria-label'),ariaChecked:el.getAttribute('aria-checked'),dataTestId:el.getAttribute('data-testid'),text:clean(el.innerText||el.textContent),className:typeof el.className==='string'?el.className:'',outerHTML:el.outerHTML.slice(0,3000)})).filter(x=>/search|web|research|browse/i.test([x.ariaLabel,x.dataTestId,x.text,x.className].join(' '))).slice(0,80);
    const assistant=[...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1)||null;
    return {stage, clickedSelector, url:location.href, title:document.title, at:new Date().toISOString(), menuMatrix:candidates.map(countFor), activeMatrix:activeCandidates.map(countFor), menuish, finalAssistantText:clean(assistant?.innerText||assistant?.textContent), finalAssistantHTML:(assistant?.outerHTML||'').slice(0,60000), bodyTail:clean(document.body?.innerText||'').slice(-4000)};
  },{candidates,activeCandidates,stage,clickedSelector});
}
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx=browser.contexts()[0];
const result={probedAt:new Date().toISOString(), prompt:'List 3 AI safety events from 2026 so far. Include the year 2026 in each item.', stages:[]};
let page;
try{
  await closeConversationTabs(ctx);
  page=ctx.pages().find(p=>p.url().startsWith('https://chatgpt.com/')) || await ctx.newPage();
  await page.goto('https://chatgpt.com/?model=gpt-4o',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('#prompt-textarea',{state:'visible',timeout:20000});
  await page.click('#composer-plus-btn',{timeout:10000});
  await page.waitForTimeout(750);
  result.stages.push(await collect(page,'menu-open'));
  let clicked='';
  for(const s of candidates){ const loc=page.locator(s).first(); if(await loc.count().catch(()=>0)){ try{ await loc.click({timeout:5000}); clicked=s; break; }catch{} } }
  if(!clicked){
    const handle=await page.locator('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"], button').filter({hasText:/\b(web search|search the web|search)\b/i}).first();
    await handle.click({timeout:5000}); clicked='text-regex:/web search|search the web|search/i';
  }
  await page.waitForTimeout(1000);
  result.clickedSelector=clicked;
  result.stages.push(await collect(page,'after-activate',clicked));
  const activeFound=[]; for(const s of activeCandidates){ const n=await page.locator(s).count().catch(()=>0); if(n) activeFound.push({selector:s,count:n}); }
  result.activeFound=activeFound;
  await page.locator('#prompt-textarea').click({timeout:10000});
  await page.keyboard.type(result.prompt,{delay:1});
  const sendSelectors=['button[data-testid="composer-submit-button"]','button[data-testid="send-button"]','#composer-submit-button','button[aria-label*="Send" i]'];
  let sent=''; for(const s of sendSelectors){ const loc=page.locator(s).last(); if(await loc.count().catch(()=>0)){ try{ await loc.click({timeout:5000}); sent=s; break;}catch{} } }
  if(!sent) throw new Error('send button not found');
  result.sentSelector=sent;
  const before=Date.now(); let last=''; let stable=0; let completion=false;
  while(Date.now()-before<180000){
    const text=await page.locator('[data-message-author-role="assistant"]').last().innerText({timeout:3000}).catch(()=>last);
    const stop=await page.locator('button[data-testid="stop-button"], button[aria-label*="Stop" i]').count().catch(()=>0);
    if(/429|too many requests|rate limit/i.test(await page.locator('body').innerText({timeout:1000}).catch(()=>''))) throw new Error('RATE_LIMIT_SIGNAL');
    if(text && text===last){ if(!stable) stable=Date.now(); } else { last=text; stable=Date.now(); }
    if(text && !stop && Date.now()-stable>2500){ completion=true; break; }
    await sleep(750);
  }
  result.completion={completion_detected:completion,wait_ms:Date.now()-before,response_text:last};
  result.stages.push(await collect(page,'after-response',clicked));
  result.recommended = {menuSelector: clicked, activeSelector: activeFound[0]?.selector || null};
  fs.writeFileSync(outPath,JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,outPath,recommended:result.recommended,completion},null,2));
}catch(e){
  result.ok=false; result.error=String(e?.stack||e); if(page) result.stages.push(await collect(page,'error').catch(err=>({collectError:String(err)}))); fs.writeFileSync(outPath,JSON.stringify(result,null,2)); console.error(JSON.stringify({ok:false,outPath,error:String(e?.message||e)},null,2)); process.exitCode=/RATE_LIMIT_SIGNAL/.test(String(e?.message||e))?42:1;
}finally{
  if(ctx){ await closeConversationTabs(ctx); if(!ctx.pages().some(p=>p.url()==='https://chatgpt.com/' || /^https:\/\/chatgpt\.com\/?(?:$|[?#])/.test(p.url()))){ const h=await ctx.newPage(); await h.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{}); } }
  await browser.close().catch(()=>{});
}
