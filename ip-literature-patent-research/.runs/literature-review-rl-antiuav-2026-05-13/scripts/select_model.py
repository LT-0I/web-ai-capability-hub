import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  page=[pg for pg in browser.contexts[0].pages if 'chatgpt.com' in pg.url][0]
  await page.locator('button').filter(has_text='Pro').first.click(timeout=5000)
  await page.wait_for_timeout(1000)
  await page.screenshot(path=str(RUN/'phaseA-screenshots/01a-model-menu-open.png'), full_page=False)
  print((await page.locator('body').inner_text())[-1000:])
  try:
   await page.get_by_text('Thinking', exact=True).click(timeout=5000)
  except Exception as e:
   print('exact failed', e)
   await page.get_by_text('Thinking', exact=False).last.click(timeout=5000)
  await page.wait_for_timeout(2000)
  await page.screenshot(path=str(RUN/'phaseA-screenshots/01-model-thinking.png'), full_page=False)
  print('selected tail', (await page.locator('body').inner_text())[-500:])
asyncio.run(main())
