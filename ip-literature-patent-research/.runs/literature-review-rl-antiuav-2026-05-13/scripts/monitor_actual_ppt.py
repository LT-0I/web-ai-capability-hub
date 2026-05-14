import asyncio,time,json,re
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
PPT=RUN/'强化学习在反无人机系统中的应用-组会汇报.pptx'
LOG=[]
async def click_actual(pg):
 # prefer elements associated with pptx filename or file card after assistant response, not generic download all attachments
 locators=[
  'a:has-text("组会汇报.pptx")',
  'a:has-text(".pptx")',
  'button[aria-label*="组会汇报.pptx"]',
  'button[aria-label*=".pptx"]',
  'a[download$=".pptx"]',
  'a[href*="pptx"]',
 ]
 for sel in locators:
  try:
   loc=pg.locator(sel); n=await loc.count()
   for i in range(min(n,10)):
    el=loc.nth(i)
    txt=''; aria=''; href=''
    try: txt=await el.inner_text(timeout=1000)
    except: pass
    try: aria=await el.get_attribute('aria-label') or ''
    except: pass
    try: href=await el.get_attribute('href') or ''
    except: pass
    LOG.append({'actual_candidate':sel,'i':i,'txt':txt,'aria':aria,'href':href})
    async with pg.expect_download(timeout=20000) as dlinfo:
     await el.click(timeout=5000, force=True)
    dl=await dlinfo.value
    if not dl.suggested_filename.lower().endswith('.pptx'):
     LOG.append({'skip_download':dl.suggested_filename})
     continue
    await dl.save_as(str(PPT)); LOG.append({'downloaded':dl.suggested_filename,'selector':sel,'i':i}); return True
  except Exception as e: LOG.append({'selector_fail':sel,'err':repr(e)[:200]})
 # If visible text has pptx, inspect nearby buttons with download aria excluding download all
 try:
  handles=await pg.locator('button[aria-label*="下载"], button[aria-label*="Download" i]').element_handles()
  for idx,h in enumerate(handles):
   aria=await h.get_attribute('aria-label') or ''
   if '文件' in aria and 'pptx' not in aria: continue
   if 'apps' in aria.lower() or '对话选项' in aria: continue
   box=await h.bounding_box()
   LOG.append({'button_candidate_idx':idx,'aria':aria,'box':box})
   async with pg.expect_download(timeout=20000) as dlinfo:
    await h.click(force=True)
   dl=await dlinfo.value
   if dl.suggested_filename.lower().endswith('.pptx'):
    await dl.save_as(str(PPT)); LOG.append({'downloaded':dl.suggested_filename,'button_idx':idx}); return True
   LOG.append({'nonppt_download':dl.suggested_filename})
 except Exception as e: LOG.append({'button_phase_fail':repr(e)[:250]})
 return False
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  start=time.time(); last=''
  while time.time()-start<1800:
   await pg.wait_for_timeout(15000)
   txt=await pg.locator('body').inner_text(timeout=5000); last=txt
   (RUN/'scripts/phaseB_live_body.txt').write_text(txt,encoding='utf-8')
   print('t',int(time.time()-start),'len',len(txt),'tail',txt[-500:].replace('\n',' | '))
   if any(x in txt for x in ['CAPTCHA','验证码','验证你是人类','human verification']): LOG.append({'blocker':'captcha'}); break
   if '.pptx' in txt or '组会汇报' in txt:
    await pg.screenshot(path=str(RUN/'phaseB-screenshots/03-actual-ppt-candidate.png'), full_page=False)
    if await click_actual(pg): break
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/99-after-download.png'), full_page=False)
  LOG.append({'elapsed':round(time.time()-start),'ppt_exists':PPT.exists(),'last_tail':last[-2000:]})
  (RUN/'scripts/phaseB_actual_monitor_log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
