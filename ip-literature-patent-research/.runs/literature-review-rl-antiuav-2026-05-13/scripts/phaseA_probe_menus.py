import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
LOG=[]
async def shot(page, name):
 await page.screenshot(path=str(RUN/'phaseA-screenshots'/name), full_page=False)
async def click_and_log(page, desc, locator, shotname):
 try:
  await locator.click(timeout=3000)
  await page.wait_for_timeout(1000)
  await shot(page, shotname)
  txt=await page.locator('body').inner_text(timeout=3000)
  LOG.append({'desc':desc,'worked':True,'visible_text_after':txt[-1500:]})
  await page.keyboard.press('Escape')
  await page.wait_for_timeout(500)
  return txt
 except Exception as e:
  LOG.append({'desc':desc,'worked':False,'error':repr(e)})
  return ''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  page=[pg for pg in browser.contexts[0].pages if 'chatgpt.com' in pg.url][0]
  await page.set_viewport_size({'width':1400,'height':900})
  await page.wait_for_timeout(1000)
  # try model picker (current Pro bottom or header)
  model_buttons=[page.get_by_text('Pro', exact=True), page.locator('button').filter(has_text='Pro').first, page.locator('button[aria-label*="模型"], button[aria-label*="Model" i]').first]
  for i,loc in enumerate(model_buttons):
   txt=await click_and_log(page, f'model_picker_candidate_{i}', loc, f'01-model-menu-cand{i}.png')
   if any(s in txt for s in ['Thinking','思考','GPT-5','标准','standard']):
    break
  # if menu text shows thinking, click it
  try:
   await page.get_by_text('Thinking', exact=False).first.click(timeout=2000)
   LOG.append({'desc':'thinking_option_text_Thinking','worked':True})
  except Exception as e:
   try:
    await page.get_by_text('思考', exact=False).first.click(timeout=2000)
    LOG.append({'desc':'thinking_option_text_思考','worked':True})
   except Exception as e2:
    LOG.append({'desc':'thinking_option','worked':False,'error':repr(e2)})
  await page.wait_for_timeout(1000)
  await shot(page,'01-model-thinking.png')
  # probe conversation/share options
  probes=[
   ('conversation_options','[data-testid="conversation-options-button"]','NN-menu-conversation-options.png'),
   ('share_chat','[data-testid="share-chat-button"]','NN-menu-share-chat.png'),
   ('assistant_more_operations','button[aria-label="更多操作"]','NN-menu-assistant-more.png'),
   ('assistant_share','button[aria-label="分享"]','NN-menu-assistant-share.png'),
  ]
  for desc,sel,fn in probes:
   await click_and_log(page, desc, page.locator(sel).last, fn)
  # right click around visible report/message area and header
  for desc,xy in [('right_click_top_report',(520,160)),('right_click_header',(510,50)),('right_click_mid',(760,400))]:
   try:
    await page.mouse.click(xy[0],xy[1], button='right')
    await page.wait_for_timeout(1000); await shot(page, f'NN-menu-{desc}.png')
    LOG.append({'desc':desc,'worked':True,'body_tail':(await page.locator('body').inner_text())[-1000:]})
    await page.keyboard.press('Escape')
   except Exception as e: LOG.append({'desc':desc,'worked':False,'error':repr(e)})
  (RUN/'scripts/phaseA_menu_probe_log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(LOG,ensure_ascii=False,indent=2))
asyncio.run(main())
