import asyncio
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.goto('https://chatgpt.com/')
  await pg.wait_for_timeout(3000)
  # select Pro
  try: await pg.locator('button').filter(has_text='Thinking').first.click(timeout=2000)
  except: pass
  try:
   await pg.get_by_role('menuitemradio').filter(has_text='Pro').last.click(timeout=3000)
  except Exception as e: print('pro select maybe', e)
  await pg.wait_for_timeout(1000)
  ed=pg.locator('#prompt-textarea').last
  await ed.click(); await pg.keyboard.insert_text('测试')
  await pg.wait_for_timeout(1000)
  print((await pg.locator('body').inner_text())[-500:])
  print('disabled', await pg.locator('[data-testid="send-button"]').last.evaluate('b=>b.disabled'), 'model button txt', await pg.locator('button').filter(has_text='进阶专业').count())
asyncio.run(main())
