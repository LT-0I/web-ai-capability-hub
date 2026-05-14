import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=b.contexts[0].pages[0]
  await pg.screenshot(path=str(RUN/'phaseA-screenshots/99-after-export.png'), full_page=False)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/99-after-download.png'), full_page=False)
asyncio.run(main())
