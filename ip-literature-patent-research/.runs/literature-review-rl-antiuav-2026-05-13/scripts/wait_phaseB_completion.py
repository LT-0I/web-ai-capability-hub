import asyncio,time,json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=b.contexts[0].pages[0]
  for k in range(40):
   await pg.wait_for_timeout(15000)
   txt=await pg.locator('body').inner_text(timeout=5000)
   (RUN/'scripts/phaseB_live_body.txt').write_text(txt,encoding='utf-8')
   print('iter',k,'len',len(txt),'tail',txt[-700:].replace('\n',' | '), flush=True)
   if '.pptx' in txt or 'Download' in txt or '下载' in txt or '已生成' in txt or '完成' in txt:
    await pg.screenshot(path=str(RUN/'phaseB-screenshots/03-ppt-maybe-ready.png'), full_page=False)
asyncio.run(main())
