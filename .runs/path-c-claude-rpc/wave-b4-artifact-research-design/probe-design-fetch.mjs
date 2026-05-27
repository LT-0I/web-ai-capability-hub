import fs from 'node:fs';
import { chromium } from 'playwright';
const out = '.runs/path-c-claude-rpc/wave-b4-artifact-research-design/probe-design-fetch.json';
const projectId = '6b373bb0-fe5f-4558-8040-ea03c3becb4a';
const file = 'index.html';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
try {
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('/design/p/')) || context.pages().find(p => p.url().includes('claude.ai')) || await context.newPage();
  await page.goto(`https://claude.ai/design/p/${projectId}?file=${encodeURIComponent(file)}`, {waitUntil:'domcontentloaded', timeout:30000}).catch(()=>{});
  await page.waitForSelector('iframe[data-testid="html-viewer-iframe"], iframe[src*="claudeusercontent.com"]', {timeout:30000}).catch(()=>{});
  const attempts = [];
  const paths = [
    '/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile',
    'https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile'
  ];
  const bodies = [
    {projectId, path:file, raw:true},
    {project_id: projectId, path:file, raw:true},
    {projectId, path:file},
    {project_id: projectId, path:file},
  ];
  const headerSets = [
    {'content-type':'application/json', 'accept':'application/json'},
    {'content-type':'application/json', 'accept':'application/json', 'connect-protocol-version':'1'},
    {'content-type':'application/proto', 'accept':'application/json', 'connect-protocol-version':'1'},
  ];
  for (const url of paths) for (const body of bodies) for (const headers of headerSets) {
    const res = await page.evaluate(async ({url, body, headers}) => {
      try {
        const response = await fetch(url, {method:'POST', credentials:'include', headers, body: JSON.stringify(body)});
        const text = await response.text();
        return {url: response.url, status: response.status, statusText: response.statusText, contentType: response.headers.get('content-type'), text: text.slice(0,1000)};
      } catch (e) { return {error: String(e?.message || e)}; }
    }, {url, body, headers});
    attempts.push({url, body, headers, res});
  }
  fs.writeFileSync(out, JSON.stringify({pageUrl: page.url(), attempts}, null, 2));
} finally { await browser.close().catch(()=>{}); }
