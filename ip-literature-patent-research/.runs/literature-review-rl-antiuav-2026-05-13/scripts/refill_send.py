import asyncio
from playwright.async_api import async_playwright
prompt='''附件是「强化学习在反无人机系统中的应用」的文献综述。请基于此内容生成一份用于组会汇报的 PPT（中文），要求：
- 12–18 张幻灯片
- 包含：封面、研究背景与意义、问题定义与挑战、典型方法分类（值函数 / 策略梯度 / 多智能体 / 模仿学习 / Sim-to-Real）、代表性工作对比、仿真平台与数据集、评测指标、开放问题与未来方向、结论、参考文献
- 风格：学术、清晰、深色背景
- 直接输出为 .pptx 文件，提供下载链接（不要把内容只写在对话里）
- 文件名：强化学习在反无人机系统中的应用-组会汇报.pptx'''
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
  pg=[x for x in b.contexts[0].pages if 'chatgpt.com' in x.url][0]
  ed=pg.locator('#prompt-textarea').last
  await ed.click()
  await pg.keyboard.press('Control+A')
  await pg.keyboard.press('Backspace')
  await pg.wait_for_timeout(500)
  await pg.evaluate("text => navigator.clipboard.writeText(text)", prompt)
  await pg.keyboard.press('Control+V')
  await pg.wait_for_timeout(1500)
  print('disabled after paste', await pg.locator('[data-testid="send-button"]').last.evaluate('b=>b.disabled'))
  print('tail', (await pg.locator('body').inner_text())[-1000:])
  await pg.locator('[data-testid="send-button"]').last.click(timeout=5000)
  print('sent')
asyncio.run(main())
