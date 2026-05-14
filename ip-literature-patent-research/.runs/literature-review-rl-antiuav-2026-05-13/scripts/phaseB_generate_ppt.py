import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
RUN=Path('ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13')
DOC=RUN/'强化学习在反无人机系统中的应用-文献综述.docx'
PPT=RUN/'强化学习在反无人机系统中的应用-组会汇报.pptx'
LOG=[]
async def shot(page, name):
    await page.screenshot(path=str(RUN/'phaseB-screenshots'/name), full_page=False)
async def body(page):
    try: return await page.locator('body').inner_text(timeout=3000)
    except: return ''
async def select_model(page, model_text='Pro'):
    # click current model pill/button by known labels
    candidates=[page.locator('button').filter(has_text='Thinking').first, page.locator('button').filter(has_text='Instant').first, page.locator('button').filter(has_text='Pro').first, page.locator('button[aria-label*="模型"], button[aria-label*="Model" i]').first]
    opened=False
    for loc in candidates:
        try:
            if await loc.count():
                await loc.click(timeout=3000); opened=True; break
        except Exception as e:
            pass
    if not opened:
        LOG.append({'phaseB.model_picker': {'worked': False, 'error': 'no candidate opened'}}); return False
    await page.wait_for_timeout(1000)
    await shot(page,'00a-model-menu-open.png')
    # Try exact/partial Pro entry not profile
    for sel_desc, loc in [
        ('text exact Pro', page.get_by_text('Pro', exact=True).last),
        ('role menu Pro', page.get_by_role('menuitem').filter(has_text='Pro').last),
        ('text GPT Pro', page.get_by_text('GPT-5 Pro', exact=False).last),
    ]:
        try:
            await loc.click(timeout=3000)
            await page.wait_for_timeout(1500)
            LOG.append({'phaseB.pro_option': {'selector': sel_desc, 'worked': True}})
            return True
        except Exception as e:
            LOG.append({'phaseB.pro_option_try': {'selector': sel_desc, 'worked': False, 'error': repr(e)[:250]}})
    return False
async def send_prompt(page, prompt):
    editor = page.locator('#prompt-textarea, div[contenteditable="true"][data-virtualkeyboard], div[contenteditable="true"]').last
    await editor.click(timeout=10000)
    # use clipboard paste via JS/keyboard to preserve Chinese/newlines
    await page.evaluate("text => navigator.clipboard.writeText(text)", prompt)
    await page.keyboard.press('Control+V')
    await page.wait_for_timeout(1000)
    await shot(page,'01b-prompt-filled.png')
    # Send using button if enabled
    for sel in ['[data-testid="send-button"]','button[aria-label*="发送"], button[aria-label*="Send" i]']:
        try:
            btn=page.locator(sel).last
            await btn.click(timeout=3000)
            LOG.append({'phaseB.send': {'selector': sel, 'worked': True}})
            return True
        except Exception as e:
            LOG.append({'phaseB.send_try': {'selector': sel, 'worked': False, 'error': repr(e)[:200]}})
    await page.keyboard.press('Enter')
    LOG.append({'phaseB.send': {'selector': 'Enter', 'worked': True}})
    return True
async def click_downloads(page):
    # Try all visible download-ish buttons/links, setting expect_download around each
    selectors=[
        'a[download]',
        'a[href*="/api/"][href*="download"]',
        'button[aria-label*="Download" i]',
        'button[aria-label*="下载"]',
        '[data-testid*="download" i]',
        'a:has-text(".pptx")',
        'button:has-text("Download")',
        'button:has-text("下载")',
    ]
    for sel in selectors:
        try:
            loc=page.locator(sel)
            n=await loc.count()
            for i in range(min(n,5)):
                el=loc.nth(i)
                try:
                    txt=(await el.inner_text(timeout=1000)) if await el.is_visible() else ''
                    aria=await el.get_attribute('aria-label')
                    LOG.append({'phaseB.download_candidate': {'selector': sel, 'index': i, 'text': txt, 'aria': aria}})
                    async with page.expect_download(timeout=15000) as dl_info:
                        await el.click(timeout=3000, force=True)
                    dl=await dl_info.value
                    await dl.save_as(str(PPT))
                    LOG.append({'phaseB.download': {'selector': sel, 'index': i, 'suggested': dl.suggested_filename, 'worked': True}})
                    return True
                except Exception as e:
                    LOG.append({'phaseB.download_try': {'selector': sel, 'index': i, 'worked': False, 'error': repr(e)[:200]}})
        except Exception as e: pass
    # iframe sandbox
    try:
        floc=page.frame_locator('iframe[src*="sandbox"], iframe').locator('[aria-label*="Download" i], [aria-label*="下载"], a[download]').first
        async with page.expect_download(timeout=15000) as dl_info:
            await floc.click(timeout=5000, force=True)
        dl=await dl_info.value; await dl.save_as(str(PPT))
        LOG.append({'phaseB.download': {'selector': 'iframe download', 'suggested': dl.suggested_filename, 'worked': True}})
        return True
    except Exception as e:
        LOG.append({'phaseB.iframe_download_try': {'worked': False, 'error': repr(e)[:300]}})
    return False
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.connect_over_cdp('http://127.0.0.1:9223')
        ctx=browser.contexts[0]
        page=[pg for pg in ctx.pages if 'chatgpt.com' in pg.url][0]
        await page.set_viewport_size({'width':1400,'height':900})
        # New chat
        try:
            await page.get_by_text('新聊天', exact=True).click(timeout=5000)
        except Exception:
            await page.goto('https://chatgpt.com/')
        await page.wait_for_timeout(3000)
        LOG.append({'phaseB.new_chat': {'url': page.url, 'worked': True}})
        # Select Pro
        ok=await select_model(page,'Pro')
        await shot(page,'00-model-pro.png')
        LOG.append({'phaseB.model_picker': {'selector': 'button text current model -> text Pro', 'worked': ok, 'body_tail': (await body(page))[-500:]}})
        # Ensure deep research off: if active chip visible in composer, try remove/toggle only if text appears as selected mode
        b=await body(page)
        LOG.append({'phaseB.deep_research_visible_before': '深度研究' in b})
        # Upload attachment via file input; if no input, click attach first
        uploaded=False
        try:
            inputs=page.locator('input[type="file"]')
            if await inputs.count()==0:
                await page.locator('[data-testid="composer-plus-btn"], button[aria-label*="添加文件"], button[aria-label*="Attach" i]').last.click(timeout=3000)
                await page.wait_for_timeout(1000)
            inputs=page.locator('input[type="file"]')
            n=await inputs.count()
            if n:
                await inputs.last.set_input_files(str(DOC.resolve()))
                uploaded=True
                await page.wait_for_timeout(8000)
        except Exception as e:
            LOG.append({'phaseB.upload_try': {'worked': False, 'error': repr(e)[:300]}})
        await shot(page,'01-attachment-state.png')
        LOG.append({'phaseB.upload': {'method': 'input[type=file]' if uploaded else 'fallback-paste-text', 'worked': uploaded, 'body_tail': (await body(page))[-1000:]}})
        prompt='''附件是「强化学习在反无人机系统中的应用」的文献综述。请基于此内容生成一份用于组会汇报的 PPT（中文），要求：
- 12–18 张幻灯片
- 包含：封面、研究背景与意义、问题定义与挑战、典型方法分类（值函数 / 策略梯度 / 多智能体 / 模仿学习 / Sim-to-Real）、代表性工作对比、仿真平台与数据集、评测指标、开放问题与未来方向、结论、参考文献
- 风格：学术、清晰、深色背景
- 直接输出为 .pptx 文件，提供下载链接（不要把内容只写在对话里）
- 文件名：强化学习在反无人机系统中的应用-组会汇报.pptx'''
        if not uploaded:
            # extract docx text locally
            import docx
            d=docx.Document(DOC)
            text='\n'.join(p.text for p in d.paragraphs if p.text.strip())
            prompt += '\n\n以下是文献综述全文：\n' + text[:50000]
        await send_prompt(page,prompt)
        await shot(page,'02-after-send.png')
        # wait for completion and download candidate
        start=time.time(); downloaded=False; last_text=''
        while time.time()-start < 30*60:
            await page.wait_for_timeout(10000)
            txt=await body(page); last_text=txt
            (RUN/'scripts/phaseB_live_body.txt').write_text(txt,encoding='utf-8')
            if any(x in txt for x in ['验证码','CAPTCHA','human verification','验证你是人类']):
                LOG.append({'phaseB.blocker':'captcha_or_human_verification'}); break
            if '.pptx' in txt or '下载' in txt or 'Download' in txt:
                await shot(page,'03-download-candidate.png')
                if await click_downloads(page):
                    downloaded=True; break
            # stop if obvious quota/unavailable
            if any(x in txt for x in ['已达到上限','quota','unavailable','不可用','升级']):
                LOG.append({'phaseB.blocker_text': txt[-1000:]}); break
        await shot(page,'99-after-download.png')
        LOG.append({'phaseB.wait_seconds': round(time.time()-start), 'downloaded': downloaded, 'last_tail': last_text[-1500:]})
        (RUN/'scripts/phaseB_generate_log.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(LOG, ensure_ascii=False, indent=2)[-8000:])
asyncio.run(main())
