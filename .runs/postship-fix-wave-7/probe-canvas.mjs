import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const outDir='.runs/postship-fix-wave-7/probes'; fs.mkdirSync(outDir,{recursive:true});
const outPath=path.join(outDir,'canvas.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function closeConversationTabs(ctx){ for(const p of ctx.pages()) if(p.url().startsWith('https://chatgpt.com/c/')) await p.close().catch(()=>{}); }
const downloadSelectors=[
  'button[aria-haspopup="menu"]:has-text("Download")',
  'button:has-text("Download")',
  'button[aria-label*="Download" i]',
  'button[title*="Download" i]',
  '[role="button"]:has-text("Download")',
  'button:has-text("Export")',
  'button[aria-label*="Export" i]',
  '[role="button"]:has-text("Export")'
];
const openCanvasSelectors=[
  'button[aria-label*="canvas" i]',
  'a[aria-label*="canvas" i]',
  '[role="button"][aria-label*="canvas" i]',
  'button:has-text("Open in canvas")',
  'button:has-text("Canvas")',
  'a:has-text("Canvas")',
  '[role="button"]:has-text("Canvas")'
];
async function collect(page, stage, extra={}){
  return await page.evaluate(({downloadSelectors,openCanvasSelectors,stage,extra})=>{
    const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
    const countFor=s=>{try{const nodes=[...document.querySelectorAll(s)];return{selector:s,count:nodes.length,first:nodes[0]?{tag:nodes[0].tagName,role:nodes[0].getAttribute('role'),ariaLabel:nodes[0].getAttribute('aria-label'),ariaExpanded:nodes[0].getAttribute('aria-expanded'),title:nodes[0].getAttribute('title'),dataTestId:nodes[0].getAttribute('data-testid'),text:clean(nodes[0].innerText||nodes[0].textContent),className:typeof nodes[0].className==='string'?nodes[0].className:'',outerHTML:nodes[0].outerHTML.slice(0,4000)}:null}}catch(e){return{selector:s,count:0,error:String(e?.message||e)}}};
    const interesting=[...document.querySelectorAll('button,a,[role="button"],[role="menuitem"],[role="option"],[aria-label],[data-testid]')].map(el=>({tag:el.tagName,role:el.getAttribute('role'),ariaLabel:el.getAttribute('aria-label'),ariaExpanded:el.getAttribute('aria-expanded'),title:el.getAttribute('title'),dataTestId:el.getAttribute('data-testid'),href:el.getAttribute('href'),text:clean(el.innerText||el.textContent),className:typeof el.className==='string'?el.className:'',outerHTML:el.outerHTML.slice(0,3000)})).filter(x=>/canvas|download|export|markdown|docx|pdf|copy|share/i.test([x.ariaLabel,x.title,x.dataTestId,x.href,x.text,x.className].join(' '))).slice(0,160);
    const assistant=[...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1)||null;
    return {stage,extra,at:new Date().toISOString(),url:location.href,title:document.title,downloadMatrix:downloadSelectors.map(countFor),openCanvasMatrix:openCanvasSelectors.map(countFor),interesting,finalAssistantText:clean(assistant?.innerText||assistant?.textContent),bodyTail:clean(document.body?.innerText||'').slice(-5000)};
  },{downloadSelectors,openCanvasSelectors,stage,extra});
}
async function send(page,prompt){
 await page.goto('https://chatgpt.com/?model=gpt-4o',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForSelector('#prompt-textarea',{state:'visible',timeout:20000});
 await page.locator('#prompt-textarea').click();
 await page.keyboard.type(prompt,{delay:1});
 const sends=['button[data-testid="composer-submit-button"]','button[data-testid="send-button"]','#composer-submit-button','button[aria-label*="Send" i]'];
 for(const s of sends){const loc=page.locator(s).last(); if(await loc.count().catch(()=>0)){try{await loc.click({timeout:5000}); return s;}catch{}}}
 throw new Error('send not found');
}
async function waitDone(page,timeout=180000){
 const start=Date.now(); let last='',stable=0;
 while(Date.now()-start<timeout){
   const body=await page.locator('body').innerText({timeout:1000}).catch(()=>'');
   if(/429|too many requests|rate limit/i.test(body)) throw new Error('RATE_LIMIT_SIGNAL');
   const text=await page.locator('[data-message-author-role="assistant"]').last().innerText({timeout:2000}).catch(()=>last);
   const stop=await page.locator('button[data-testid="stop-button"], button[aria-label*="Stop" i]').count().catch(()=>0);
   if(text && text===last){ if(!stable) stable=Date.now(); } else { last=text; stable=Date.now(); }
   if(text && !stop && Date.now()-stable>2500) return {completion_detected:true,wait_ms:Date.now()-start,response_text:text};
   await sleep(750);
 }
 return {completion_detected:false,wait_ms:Date.now()-start,response_text:last};
}
async function clickFirst(page, selectors){
 for(const s of selectors){ const loc=page.locator(s).first(); if(await loc.count().catch(()=>0)){ try{ await loc.click({timeout:5000}); return s; }catch{} } }
 return '';
}
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
const ctx=browser.contexts()[0];
const result={probedAt:new Date().toISOString(),prompt:"Use canvas to write a document titled 'Probe Canvas Wave 7' with 3 short paragraphs about machine learning history."};
let page;
try{
 await closeConversationTabs(ctx);
 page=ctx.pages().find(p=>p.url().startsWith('https://chatgpt.com/')) || await ctx.newPage();
 result.sentSelector=await send(page,result.prompt);
 result.completion=await waitDone(page,180000);
 result.chatUrl=page.url();
 await sleep(2000);
 result.stages=[await collect(page,'after-response')];
 let activeDownload=downloadSelectors.find(async s=>await page.locator(s).count().catch(()=>0));
 const beforeCounts=[]; for(const s of downloadSelectors) beforeCounts.push({s,n:await page.locator(s).count().catch(()=>0)});
 result.beforeCounts=beforeCounts;
 if(!beforeCounts.some(x=>x.n>0)){
   const opened=await clickFirst(page,openCanvasSelectors);
   result.openedCanvasSelector=opened;
   await sleep(2000);
   result.stages.push(await collect(page,'after-open-canvas',{opened}));
 }
 const counts=[]; for(const s of downloadSelectors) counts.push({s,n:await page.locator(s).count().catch(()=>0)});
 result.afterOpenCounts=counts;
 const downloadSelector=(counts.find(x=>x.n>0)||{}).s || '';
 result.downloadSelector=downloadSelector;
 if(downloadSelector){
   await page.locator(downloadSelector).first().click({timeout:5000}).catch(e=>{result.downloadClickError=String(e?.message||e)});
   await sleep(1000);
   result.stages.push(await collect(page,'download-menu-open',{downloadSelector}));
 }
 result.recommended={downloadSelector, openCanvasSelector: result.openedCanvasSelector || null};
 fs.writeFileSync(outPath,JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:true,outPath,recommended:result.recommended,completion:result.completion?.completion_detected},null,2));
}catch(e){
 result.ok=false; result.error=String(e?.stack||e); if(page) result.stages=[...(result.stages||[]), await collect(page,'error').catch(err=>({collectError:String(err)}))]; fs.writeFileSync(outPath,JSON.stringify(result,null,2)); console.error(JSON.stringify({ok:false,outPath,error:String(e?.message||e)},null,2)); process.exitCode=/RATE_LIMIT_SIGNAL/.test(String(e?.message||e))?42:1;
}finally{
 // Keep this canvas conversation tab open until codex probe starts? Close per directive after probe evidence captured.
 await closeConversationTabs(ctx);
 if(!ctx.pages().some(p=>p.url()==='https://chatgpt.com/' || /^https:\/\/chatgpt\.com\/?(?:$|[?#])/.test(p.url()))){ const h=await ctx.newPage(); await h.goto('https://chatgpt.com/',{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{}); }
 await browser.close().catch(()=>{});
}
