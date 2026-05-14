import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.wait_for_timeout(5000)
  print('body tail', (await pg.locator('body').inner_text())[-1000:])
  print('send disabled', await pg.locator('[data-testid="send-button"]').last.get_attribute('disabled'))
  # trigger input by appending then backspace
  ed=pg.locator('#prompt-textarea').last
  await ed.click()
  await pg.keyboard.press('End')
  await pg.keyboard.insert_text(' ')
  await pg.keyboard.press('Backspace')
  await pg.wait_for_timeout(1000)
  print('send disabled2', await pg.locator('[data-testid="send-button"]').last.get_attribute('disabled'))
  try:
    await pg.locator('[data-testid="send-button"]').last.click(timeout=10000)
    print('clicked send')
  except Exception as e:
    print('click failed',e)
    await pg.keyboard.press('Control+Enter')
    print('ctrl enter')
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/02-after-send.png'), full_page=False)
asyncio.run(main())
