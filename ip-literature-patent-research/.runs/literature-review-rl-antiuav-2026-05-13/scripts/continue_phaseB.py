import asyncio,json,time
from pathlib import Path
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
DOC=RUN/'强化学习在反无人机系统中的应用-文献综述.docx'
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.set_viewport_size({'width':1400,'height':900})
  # if menu open select pro
  try:
   await pg.get_by_role('menuitemradio').filter(has_text='Pro').last.click(timeout=3000)
  except Exception as e:
   print('pro click menu failed', e)
   try:
    await pg.locator('button').filter(has_text='Thinking').first.click(timeout=3000)
    await pg.wait_for_timeout(500)
    await pg.get_by_role('menuitemradio').filter(has_text='Pro').last.click(timeout=3000)
   except Exception as e2: print('pro second failed', e2)
  await pg.wait_for_timeout(1500)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/00-model-pro.png'), full_page=False)
  print('tail after pro', (await pg.locator('body').inner_text())[-500:])
  prompt='''附件是「强化学习在反无人机系统中的应用」的文献综述。请基于此内容生成一份用于组会汇报的 PPT（中文），要求：
- 12–18 张幻灯片
- 包含：封面、研究背景与意义、问题定义与挑战、典型方法分类（值函数 / 策略梯度 / 多智能体 / 模仿学习 / Sim-to-Real）、代表性工作对比、仿真平台与数据集、评测指标、开放问题与未来方向、结论、参考文献
- 风格：学术、清晰、深色背景
- 直接输出为 .pptx 文件，提供下载链接（不要把内容只写在对话里）
- 文件名：强化学习在反无人机系统中的应用-组会汇报.pptx'''
  # find editable
  locs=await pg.evaluate('''() => [...document.querySelectorAll('textarea, [contenteditable="true"], #prompt-textarea')].map((e,i)=>{const r=e.getBoundingClientRect(); return {i,tag:e.tagName,id:e.id,role:e.getAttribute('role'),aria:e.getAttribute('aria-label'),text:(e.innerText||e.value||'').slice(0,100),rect:{x:r.x,y:r.y,w:r.width,h:r.height}, visible:r.width>0&&r.height>0}})''')
  print('editables', json.dumps(locs, ensure_ascii=False, indent=2))
  # use JS set content in ProseMirror; click then keyboard type insert_text chunks (more reliable than clipboard)
  editor=pg.locator('#prompt-textarea').last
  await editor.click(timeout=5000)
  # Try fill if textarea, else insert_text
  try:
   await editor.fill(prompt, timeout=3000)
  except Exception as e:
   await pg.keyboard.insert_text(prompt)
  await pg.wait_for_timeout(1000)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/01b-prompt-filled.png'), full_page=False)
  print('tail filled', (await pg.locator('body').inner_text())[-1200:])
  await pg.locator('[data-testid="send-button"], button[aria-label*="发送"]').last.click(timeout=5000)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/02-after-send.png'), full_page=False)
  print('sent')
asyncio.run(main())
