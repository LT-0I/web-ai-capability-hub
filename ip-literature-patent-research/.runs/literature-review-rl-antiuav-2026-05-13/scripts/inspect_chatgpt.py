import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  ctx=browser.contexts[0]
  pages=ctx.pages
  if not pages:
   page=await ctx.new_page(); await page.goto('https://chatgpt.com/')
  else: page=pages[0]
  # ensure chatgpt page
  cg=[pg for pg in ctx.pages if 'chatgpt.com' in pg.url]
  if cg: page=cg[0]
  else:
   page=await ctx.new_page(); await page.goto('https://chatgpt.com/')
  await page.wait_for_load_state('domcontentloaded')
  await page.wait_for_timeout(5000)
  await page.screenshot(path=str(RUN/'phaseA-screenshots/00-initial-tabs.png'), full_page=True)
  print('pages', len(ctx.pages), [pg.url for pg in ctx.pages])
  print('title', await page.title(), 'url', page.url)
  body=(await page.locator('body').inner_text(timeout=5000))[:4000]
  print(body)
asyncio.run(main())
