import asyncio, json, shutil, time
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
OUT=RUN/'round2-chatgpt-pro-generated-presentation.pptx'
FINAL=RUN/'强化学习在反无人机系统中的应用-组会汇报.pptx'
LOG=[]
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if '6a055a9b' in x.url][0]
  await pg.bring_to_front(); await pg.set_viewport_size({'width':1400,'height':950}); await pg.wait_for_timeout(1000)
  # hover over card first to expose tooltips/icons
  await pg.mouse.move(1160,487); await pg.wait_for_timeout(1000)
  await pg.screenshot(path=str(RUN/'round2-screenshots/round2-lead1-ppt-card-hover.png'), full_page=False)
  buttons=await pg.locator('button').element_handles()
  cand=[]
  for idx,h in enumerate(buttons):
   try:
    meta=await h.evaluate('''el=>{const r=el.getBoundingClientRect();let p=el,ctx='';for(let i=0;p&&i<4;i++,p=p.parentElement)ctx+=(p.innerText||p.textContent||'')+' || ';return {idx:0,text:(el.innerText||'').trim(),aria:el.getAttribute('aria-label')||'',box:{x:r.x,y:r.y,w:r.width,h:r.height},ctx:ctx.slice(0,1000)}}''')
   except Exception: continue
   if '.pptx' in meta['ctx'] or '%E5%BC%BA' in meta['ctx'] or (1100<meta['box']['x']<1220 and 450<meta['box']['y']<510):
    cand.append((idx,h,meta)); LOG.append({'candidate_idx':idx,'meta':meta})
  # Sort top right small buttons first; likely download button beside open/share
  cand.sort(key=lambda t: (abs(t[2]['box']['y']-473), -t[2]['box']['x']))
  for idx,h,meta in cand[:8]:
   try:
    LOG.append({'trying':idx,'meta':meta})
    async with pg.expect_download(timeout=8000) as dl_info:
     await h.click(force=True, timeout=3000)
    dl=await dl_info.value
    raw=RUN/('round2-raw-download-'+dl.suggested_filename.replace('/','_'))
    await dl.save_as(str(raw)); LOG.append({'download':dl.suggested_filename,'raw':str(raw)})
    if dl.suggested_filename.lower().endswith('.pptx'):
     shutil.copy2(raw, OUT); shutil.copy2(raw, FINAL); LOG.append({'accepted':str(OUT),'final':str(FINAL)}); break
   except Exception as e:
    LOG.append({'failed':idx,'err':repr(e)[:300]})
    try: await pg.keyboard.press('Escape')
    except Exception: pass
    await pg.wait_for_timeout(500)
  (RUN/'scripts/round2-lead1-targeted-click-log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'exists':OUT.exists(),'size':OUT.stat().st_size if OUT.exists() else 0,'log':LOG[-5:]},ensure_ascii=False,indent=2))
asyncio.run(main())
