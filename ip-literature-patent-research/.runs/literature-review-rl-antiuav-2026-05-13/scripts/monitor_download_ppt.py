import asyncio,time,json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
PPT=RUN/'强化学习在反无人机系统中的应用-组会汇报.pptx'
LOG=[]
async def try_download(pg):
 sels=['a[download]','button[aria-label*="Download" i]','button[aria-label*="下载"]','a:has-text(".pptx")','button:has-text("Download")','button:has-text("下载")','[data-testid*="download" i]']
 for sel in sels:
  try:
   loc=pg.locator(sel); n=await loc.count()
   for i in range(min(n,10)):
    el=loc.nth(i)
    try:
     vis=await el.is_visible(timeout=1000)
     txt=''
     try: txt=await el.inner_text(timeout=500)
     except: pass
     aria=await el.get_attribute('aria-label')
     LOG.append({'cand':sel,'i':i,'vis':vis,'txt':txt,'aria':aria})
     if not vis and sel!='a[download]': continue
     async with pg.expect_download(timeout=10000) as dlinfo:
      await el.click(timeout=3000, force=True)
     dl=await dlinfo.value
     await dl.save_as(str(PPT))
     LOG.append({'downloaded':dl.suggested_filename,'selector':sel,'i':i})
     return True
    except Exception as e:
     LOG.append({'tryfail':sel,'i':i,'err':repr(e)[:180]})
  except Exception: pass
 return False
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  start=time.time(); last=''
  while time.time()-start<1800:
   await pg.wait_for_timeout(10000)
   txt=await pg.locator('body').inner_text(timeout=5000); last=txt
   (RUN/'scripts/phaseB_live_body.txt').write_text(txt,encoding='utf-8')
   print('t', int(time.time()-start), 'len', len(txt), 'tail', txt[-250:].replace('\n',' | '))
   if any(x in txt for x in ['CAPTCHA','验证码','验证你是人类','human verification']):
    LOG.append({'blocker':'captcha'}); break
   if any(x in txt for x in ['已达到上限','quota','不可用','unavailable']):
    LOG.append({'blocker_tail':txt[-1000:]})
   if '.pptx' in txt or '下载' in txt or 'Download' in txt or 'sandbox:' in txt:
    await pg.screenshot(path=str(RUN/'phaseB-screenshots/03-download-candidate.png'), full_page=False)
    if await try_download(pg): break
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/99-after-download.png'), full_page=False)
  LOG.append({'elapsed':round(time.time()-start),'ppt_exists':PPT.exists(),'last_tail':last[-1500:]})
  (RUN/'scripts/phaseB_monitor_log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
