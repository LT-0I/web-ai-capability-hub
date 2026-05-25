const { chromium } = require('playwright');
async function brief(el, i){ return await el.evaluate((node,i)=>({i, tag:node.tagName.toLowerCase(), text:(node.innerText||node.textContent||'').trim().replace(/\s+/g,' ').slice(0,220), aria:node.getAttribute('aria-label'), role:node.getAttribute('role'), testid:node.getAttribute('data-testid'), type:node.getAttribute('type'), cls:(node.getAttribute('class')||'').slice(0,120)}), i).catch(e=>({i,error:e.message})); }
async function list(page, selector, limit=60){
  const loc = page.locator(selector);
  const n = Math.min(await loc.count().catch(()=>0), limit);
  const out=[]; for (let i=0;i<n;i++) out.push(await brief(loc.nth(i), i)); return out;
}
(async()=>{
  const cClaude = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const pagesC = cClaude.contexts().flatMap(c=>c.pages());
  const claudeNew = pagesC.find(p=>p.url().includes('claude.ai/new')) || pagesC.find(p=>p.url().includes('claude.ai/chat')) || pagesC[0];
  console.log('\nCLAUDE PAGE', claudeNew.url());
  console.log('claude composer counts', {
    textarea: await claudeNew.locator('textarea[data-testid="chat-composer-input"]').count().catch(e=>String(e)),
    send: await claudeNew.locator('[data-testid="chat-send-button"]').count().catch(e=>String(e)),
    webXpath: await claudeNew.locator('xpath=//*[@role="menuitemcheckbox"][contains(.,"Web search")]').count().catch(e=>String(e)),
    webCss: await claudeNew.locator('[role="menuitemcheckbox"]:has-text("Web search")').count().catch(e=>String(e)),
    tools: await claudeNew.locator('button, [role="button"]').count().catch(e=>String(e))
  });
  console.log('claude buttons sample', JSON.stringify((await list(claudeNew, 'button, [role="button"]', 80)).filter(x=>/web|search|tool|attach|plus|internet|research/i.test(`${x.text} ${x.aria} ${x.testid}`)), null, 2));
  // Try open tools/menu buttons with likely labels and inspect menuitems.
  for (const sel of [
    'button[aria-label*="Tools" i]', 'button[aria-label*="Attach" i]', 'button[aria-label*="Search" i]',
    'button:has-text("Tools")', '[data-testid*="tool" i]', '[data-testid*="attachment" i]'
  ]) {
    const loc = claudeNew.locator(sel).first();
    if (await loc.count().catch(()=>0)) {
      console.log('try claude menu click', sel, await brief(loc,0));
      await loc.click({timeout:2000}).catch(e=>console.log('click failed', sel, e.message));
      await claudeNew.waitForTimeout(800);
      console.log('claude menuitems after', sel, JSON.stringify(await list(claudeNew, '[role="menuitem"], [role="menuitemcheckbox"], [role="option"], [cmdk-item]', 80), null, 2));
    }
  }
  const design = pagesC.find(p=>p.url().includes('claude.ai/design/p/baf06427')) || pagesC.find(p=>p.url().includes('claude.ai/design/p/'));
  if (design) {
    console.log('\nCLAUDE DESIGN', design.url());
    console.log('design counts', {
      textarea: await design.locator('textarea[data-testid="chat-composer-input"]').count().catch(e=>String(e)),
      send: await design.locator('[data-testid="chat-send-button"]').count().catch(e=>String(e)),
      iframe: await design.locator('iframe[data-testid="html-viewer-iframe"]').count().catch(e=>String(e)),
      presentXpath: await design.locator('xpath=//button[contains(.,"Present")]').count().catch(e=>String(e)),
      openXpath: await design.locator('xpath=//button[contains(normalize-space(.),"Open") and not(@data-testid)]').count().catch(e=>String(e))
    });
    console.log('design buttons', JSON.stringify((await list(design, 'button, [role="button"]', 120)).filter(x=>/present|open|create|generate|preview|publish|share|copy|run|file|code/i.test(`${x.text} ${x.aria} ${x.testid}`)), null, 2));
  }
  await cClaude.close();

  const cGem = await chromium.connectOverCDP('http://127.0.0.1:9225');
  const pagesG = cGem.contexts().flatMap(c=>c.pages());
  const gem = pagesG.find(p=>p.url().includes('gemini.google.com/app?hl=en')) || pagesG.find(p=>p.url().includes('gemini.google.com/app')) || pagesG[0];
  console.log('\nGEMINI PAGE', gem.url());
  console.log('gemini counts before', {
    uploadTools: await gem.locator('button[aria-label="Upload & tools"]').count().catch(e=>String(e)),
    createMusic: await gem.locator('[role="menuitemcheckbox"]:has-text("Create music")').count().catch(e=>String(e)),
    createVideo: await gem.locator('[role="menuitemcheckbox"]:has-text("Create video")').count().catch(e=>String(e)),
    textbox: await gem.locator('div[role="textbox"][contenteditable="true"]').count().catch(e=>String(e)),
    canvas: await gem.locator('button:has-text("Canvas"), [role="menuitemcheckbox"]:has-text("Canvas")').count().catch(e=>String(e))
  });
  const trigger = gem.locator('button[aria-label="Upload & tools"]').first();
  if (await trigger.count().catch(()=>0)) {
    await trigger.click({timeout:4000}).catch(e=>console.log('gem tools click failed', e.message));
    await gem.waitForTimeout(1000);
    console.log('gemini menuitems open1', JSON.stringify(await list(gem, '[role="menuitem"], [role="menuitemcheckbox"], button', 140), null, 2));
    for (const sel of ['[role="menuitem"]:has-text("More")', 'button:has-text("More")', '[role="menuitem"]:has-text("more")', '[role="menuitemcheckbox"]:has-text("More")']) {
      const loc = gem.locator(sel).first();
      if (await loc.count().catch(()=>0)) {
        console.log('click gem more', sel, await brief(loc,0));
        await loc.click({timeout:3000}).catch(e=>console.log('gem more click failed', e.message));
        await gem.waitForTimeout(1000);
        console.log('gemini menuitems open2', JSON.stringify(await list(gem, '[role="menuitem"], [role="menuitemcheckbox"], button', 160), null, 2));
        break;
      }
    }
  }
  await cGem.close();
})().catch(e=>{ console.error(e); process.exit(1); });
