import asyncio
from pathlib import Path
from docx import Document
from playwright.async_api import async_playwright
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
DOC=RUN/'强化学习在反无人机系统中的应用-文献综述.docx'
text='\n'.join(p.text for p in Document(DOC).paragraphs if p.text.strip())
prompt=f'''以下是「强化学习在反无人机系统中的应用」的文献综述全文。请基于此内容生成一份用于组会汇报的 PPT（中文），要求：
- 12–18 张幻灯片
- 包含：封面、研究背景与意义、问题定义与挑战、典型方法分类（值函数 / 策略梯度 / 多智能体 / 模仿学习 / Sim-to-Real）、代表性工作对比、仿真平台与数据集、评测指标、开放问题与未来方向、结论、参考文献
- 风格：学术、清晰、深色背景
- 直接输出为 .pptx 文件，提供下载链接（不要把内容只写在对话里）
- 文件名：强化学习在反无人机系统中的应用-组会汇报.pptx

文献综述全文如下：
{text}'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  await pg.set_viewport_size({'width':1400,'height':900})
  # ensure model Pro if model button not pro select via visible composer pill
  await pg.keyboard.press('Escape')
  await pg.wait_for_timeout(500)
  body=await pg.locator('body').inner_text()
  if '进阶专业' not in body:
   for label in ['Thinking','Instant','Pro']:
    try:
     await pg.locator('button').filter(has_text=label).first.click(timeout=2000); break
    except: pass
   await pg.wait_for_timeout(500)
   try: await pg.get_by_role('menuitemradio').filter(has_text='Pro').last.click(timeout=3000)
   except Exception as e: print('select pro failed',e)
   await pg.wait_for_timeout(1000)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/00-model-pro.png'), full_page=False)
  ed=pg.locator('#prompt-textarea').last
  await ed.click()
  await pg.keyboard.press('Control+A')
  await pg.keyboard.press('Backspace')
  await pg.wait_for_timeout(500)
  # paste in chunks via clipboard to handle size
  await pg.evaluate("text => navigator.clipboard.writeText(text)", prompt)
  await pg.keyboard.press('Control+V')
  await pg.wait_for_timeout(2000)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/01b-prompt-filled-paste.png'), full_page=False)
  print('chars', len(prompt), 'disabled', await pg.locator('[data-testid="send-button"]').last.evaluate('b=>b.disabled'))
  await pg.locator('[data-testid="send-button"]').last.click(timeout=10000)
  await pg.screenshot(path=str(RUN/'phaseB-screenshots/02-after-send.png'), full_page=False)
  print('sent')
asyncio.run(main())
