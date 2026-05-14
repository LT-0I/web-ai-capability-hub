import asyncio,json,shutil,time
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
OUT=RUN/'round2-deep-research-export.docx'
FINAL=RUN/'强化学习在反无人机系统中的应用-文献综述.docx'
LOG=[]
URL='https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831'
class Done(Exception): pass
async def main():
 try:
  async with async_playwright() as p:
   b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
   pg=await b.contexts[0].new_page(); await pg.goto(URL,wait_until='domcontentloaded',timeout=60000)
   await pg.set_viewport_size({'width':1500,'height':1000}); await pg.wait_for_timeout(10000)
   for fi,fr in enumerate(pg.frames):
    try: txt=await fr.locator('body').inner_text(timeout=2000)
    except Exception: continue
    LOG.append({'frame':fi,'url':fr.url,'snippet':txt[:800]})
    if '下载 DOCX' in txt or '文献综述.docx' in txt or '研究完成情况' in txt:
     await pg.screenshot(path=str(RUN/'round2-screenshots/phaseA-round2-docx-target-frame-visible.png'), full_page=False)
     for sel in ['a:has-text("下载 DOCX")','a:has-text(".docx")','button[aria-label="导出"]','button[aria-label*="导出"]']:
      try:
       cnt=await fr.locator(sel).count()
       LOG.append({'trying_sel':sel,'count':cnt,'frame':fi})
       if cnt<1: continue
       loc=fr.locator(sel).first
       async with pg.expect_download(timeout=10000) as dl_info:
        await loc.click(force=True, timeout=5000)
       dl=await dl_info.value
       raw=RUN/('round2-docx-targeted-raw-'+dl.suggested_filename.replace('/','_'))
       await dl.save_as(str(raw)); LOG.append({'downloaded':dl.suggested_filename,'raw':str(raw)})
       if dl.suggested_filename.lower().endswith('.docx'):
        shutil.copy2(raw,OUT); shutil.copy2(raw,FINAL); LOG.append({'accepted':str(OUT),'final':str(FINAL)}); raise Done()
      except Done: raise
      except Exception as e:
       LOG.append({'sel_failed':sel,'err':repr(e)[:300]})
       try: await pg.keyboard.press('Escape')
       except Exception: pass
       await pg.wait_for_timeout(800)
 except Done:
  pass
 finally:
  (RUN/'scripts/phaseA-round2-docx-targeted-click-log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps({'exists':OUT.exists(),'size':OUT.stat().st_size if OUT.exists() else 0,'last':LOG[-10:]},ensure_ascii=False,indent=2))
asyncio.run(main())
