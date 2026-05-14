import asyncio,json,time
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
SCRIPTS=RUN/'scripts'; SHOTS=RUN/'round2-screenshots'
URL='https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831'
async def shot(pg,name,full=False):
 p=SHOTS/name; await pg.screenshot(path=str(p),full_page=full,timeout=30000); return str(p.relative_to(RUN))
async def dump_buttons(pg,name):
 frames=[]
 for i,fr in enumerate(pg.frames):
  rec={'frame_index':i,'url':fr.url}
  try: rec['snippet']=(await fr.locator('body').inner_text(timeout=2000))[:1200]
  except Exception as e: rec['snippet_error']=repr(e)
  try:
   rec['elements']=await fr.evaluate('''() => Array.from(document.querySelectorAll('button,a,[role="button"]')).map((el,idx)=>{const r=el.getBoundingClientRect(); let p=el,ctx=''; for(let i=0;p&&i<4;i++,p=p.parentElement)ctx+=(p.innerText||p.textContent||'').replace(/\s+/g,' ').trim().slice(0,600)+' || '; return {idx,tag:el.tagName.toLowerCase(),text:(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim(),aria:el.getAttribute('aria-label')||'',title:el.getAttribute('title')||'',testid:el.getAttribute('data-testid')||'',href:el.getAttribute('href')||'',box:{x:r.x,y:r.y,w:r.width,h:r.height},context:ctx}})''')
  except Exception as e: rec['elements_error']=repr(e)
  frames.append(rec)
 out={'url':pg.url,'title':await pg.title(),'frames':frames,'ts':time.strftime('%Y-%m-%dT%H:%M:%S')}
 (SCRIPTS/f'{name}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 return out
async def main():
 result={'url':URL,'started':time.strftime('%Y-%m-%dT%H:%M:%S')}
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=await b.contexts[0].new_page(); await pg.goto(URL,wait_until='domcontentloaded',timeout=60000)
  await pg.set_viewport_size({'width':1500,'height':1000}); await pg.wait_for_timeout(10000)
  result['title']=await pg.title(); result['current_url']=pg.url
  result['top_full_page']=await shot(pg,'phaseA-round2-full-page-top-probe.png',full=True)
  # hover title patterns
  hovers=[]
  for pat in ['强化学习在反无人机系统中的应用','强化学习在反无人机','下载文件']:
   try:
    loc=pg.get_by_text(pat,exact=False).first
    await loc.scroll_into_view_if_needed(timeout=5000); await loc.hover(timeout=5000); await pg.wait_for_timeout(5000)
    hovers.append({'pattern':pat,'worked':True,'screenshot':await shot(pg,f'phaseA-round2-hover-{len(hovers)}.png')})
    await dump_buttons(pg,f'phaseA-round2-hover-{len(hovers)}-button-dump')
   except Exception as e: hovers.append({'pattern':pat,'worked':False,'error':repr(e)[:300]})
  result['hovers']=hovers
  try:
   box=await pg.locator('main').bounding_box(); x=(box['x']+box['w']-100) if box else 1200; y=(box['y']+150) if box else 180
   await pg.mouse.move(x,y); await pg.wait_for_timeout(5000)
   result['hover_top_right']={'x':x,'y':y,'screenshot':await shot(pg,'phaseA-round2-hover-top-right-report-card.png')}
   await dump_buttons(pg,'phaseA-round2-hover-top-right-button-dump')
  except Exception as e: result['hover_top_right']={'error':repr(e)}
  try:
   await pg.evaluate('window.scrollTo(0, document.body.scrollHeight)'); await pg.wait_for_timeout(3000)
   result['bottom_screenshot']=await shot(pg,'phaseA-round2-bottom-area.png')
   await dump_buttons(pg,'phaseA-round2-bottom-button-dump')
  except Exception as e: result['bottom_error']=repr(e)
  shortcuts=[]
  for keys in ['Control+Shift+S','Control+S']:
   try:
    await pg.keyboard.press(keys); await pg.wait_for_timeout(3000)
    shortcuts.append({'keys':keys,'worked':True,'screenshot':await shot(pg,'phaseA-round2-shortcut-'+keys.replace('+','-')+'.png'),'body_tail':(await pg.locator('body').inner_text(timeout=3000))[-1000:]})
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1000)
    await dump_buttons(pg,'phaseA-round2-shortcut-'+keys.replace('+','-')+'-button-dump')
   except Exception as e:
    shortcuts.append({'keys':keys,'worked':False,'error':repr(e)[:300]})
    try: await pg.keyboard.press('Escape')
    except Exception: pass
  result['shortcuts']=shortcuts
 (SCRIPTS/'round2-lead4-visual-probes-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False,indent=2))
asyncio.run(main())
