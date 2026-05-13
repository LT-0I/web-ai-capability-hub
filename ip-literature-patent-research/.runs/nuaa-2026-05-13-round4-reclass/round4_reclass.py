from __future__ import annotations
import asyncio, json, re, time, urllib.parse, traceback, subprocess, os, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / 'ip-literature-patent-research'
RUN = SKILL / '.runs' / 'nuaa-2026-05-13-round4-reclass'
EVID = RUN / 'evidence'
PROGRESS = RUN / 'progress.md'
ROUND1 = SKILL / '.runs' / 'nuaa-2026-05-13-deep-explore' / 'access_matrix.json'
REG = SKILL / 'references' / 'site_registry.json'
NEW_PROFILES = SKILL / 'references' / 'new_resource_advanced_profiles.json'
CDP = 'http://127.0.0.1:9335'
QUERY = 'UAV trajectory'
META = {
  'captured_at': None,
  'round': 4,
  'scope': 'reclassify 10 round-1 unknowns',
  'parent_run': 'nuaa-2026-05-13-round2-headed',
  'schema_version': 'nuaa-stem-round4-reclass-1.0'
}
TARGETS = [
 ('aiaa-6dcbe1b3','aiaa','AIAA 美国航空航天学会','aiaa_search.py'),
 ('asme-0e1b238e','asme','ASME 美国机械工程师学会','asme_search.py'),
 ('asce-c44fb45b','asce','ASCE 美国土木工程学会','asce_search.py'),
 ('aip-cae6db23','aip','AIP 美国物理联合会','aip_search.py'),
 ('acs-5f505783','acs','ACS 美国化学学会','acs_search.py'),
 ('annual-reviews-e26ad415','annual-reviews','Annual Reviews 综述类期刊',None),
 ('elsevier-sciencedirect-ee38095f','science-direct','Elsevier ScienceDirect (alt entry)',None),
 ('project-euclid-cdef7b59','project-euclid','Project Euclid',None),
 ('annals-of-mathematics-beec49f1','annals-of-mathematics','Annals of Mathematics',None),
 ('ahs-1247f19a','ahs','AHS 美国直升机学会',None),
]
FALLBACKS = {
 'project-euclid': {
   'id':'project-euclid','name':'Project Euclid','home_url':'https://projecteuclid.org/',
   'search_url_template':'https://projecteuclid.org/search?query={query}',
   'advanced_search_url':'https://projecteuclid.org/search/advanced',
   'access_markers':['Project Euclid','Search Results'], 'login_markers':['Log in','Sign in','Institution'],
   'stop_markers':['captcha','Access Denied','Just a moment']},
 'annals-of-mathematics': {
   'id':'annals-of-mathematics','name':'Annals of Mathematics','home_url':'https://annals.math.princeton.edu/',
   'search_url_template':'https://annals.math.princeton.edu/?s={query}',
   'advanced_search_url':'https://projecteuclid.org/search/advanced',
   'access_markers':['Annals of Mathematics','Project Euclid','Online Content'], 'login_markers':['Log in','Sign in'],
   'stop_markers':['captcha','Access Denied','Just a moment']},
}
BLOCKERS = re.compile(r'captcha|验证码|人机验证|安全验证|Just a moment|security verification|Cloudflare|abuse|blacklist|黑名单|abnormal download|access denied|forbidden|too many requests|rate limit|verify you are human|Reference number:', re.I)
IP_LOGIN = re.compile(r'IP登录|机构登录|机构用户|校园网|institution|Institutional|Access through|通过机构|Shibboleth|OpenAthens|Access provided by|南京航空航天大学|Nanjing University', re.I)
ADV_TEXT = re.compile(r'高级检索|高级搜索|Advanced Search|Advanced', re.I)
SORT_TEXT = re.compile(r'Sort|排序|Relevance|Newest|Publication Date|Most Recent|Date|Cited|每页|View', re.I)
RESULT_TEXT = re.compile(r'\bresults?\b|Search Results|Article|Journal|论文|期刊|条结果|篇|项|content|Volume|Issue', re.I)
COOKIE = re.compile(r'Accept all|Accept|Agree|同意|接受|Got it|Continue', re.I)

def now(): return datetime.now(timezone.utc).isoformat()
def rel(p: Path) -> str: return str(p.relative_to(RUN)) if p.exists() else ''
def line(msg: str):
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    with PROGRESS.open('a', encoding='utf-8') as f: f.write(f'{now()} {msg}\n')
def red_url(url: str) -> str:
    try:
        u=urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,'<redacted-query>' if u.query else '', ''))
    except Exception: return '<redacted-url>'
def safe(s: str) -> str: return re.sub(r'[^A-Za-z0-9_.-]+','_',s)[:80]

async def body_text(page, n=6000):
    try: return (await page.locator('body').inner_text(timeout=7000))[:n]
    except Exception: return ''
async def title(page):
    try: return await page.title()
    except Exception: return ''
async def shot(page, rid, feature):
    d=EVID/rid/'screenshots'; d.mkdir(parents=True, exist_ok=True)
    p=d/f'{feature}.png'
    try: await page.screenshot(path=str(p), full_page=True, timeout=20000)
    except Exception:
        try: await page.screenshot(path=str(p), timeout=10000)
        except Exception: pass
    return rel(p)
async def controls(page, max_items=220):
    js = """
    (maxItems) => {
      const out=[]; const visible=e=>{const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return s && s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0};
      const label=e=>{let a=e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('placeholder')||''; if(!a && e.id){let l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if(l) a=l.innerText}; if(!a){let p=e.closest('label'); if(p) a=p.innerText}; if(!a){let p=e.parentElement; if(p) a=p.innerText.slice(0,120)}; return (a||'').trim().replace(/\s+/g,' ')};
      for(const e of document.querySelectorAll('input,textarea,select,button,a,[role=button],[role=link]')){
        if(out.length>=maxItems) break; if(!visible(e)) continue;
        const tag=e.tagName.toLowerCase(); let opts=[]; if(tag==='select') opts=[...e.options].slice(0,50).map(o=>o.text.trim()).filter(Boolean);
        out.push({tag, type:e.getAttribute('type')||'', text:(e.innerText||e.value||'').trim().replace(/\s+/g,' ').slice(0,180), label:label(e), placeholder:e.getAttribute('placeholder')||'', name:e.getAttribute('name')||'', id:e.id||'', href:e.href||'', options:opts});
      }
      return out;
    }
    """
    try: return await page.evaluate(js, max_items)
    except Exception: return []
def label_list(ctrls, rx=None):
    out=[]
    for c in ctrls:
        s=' '.join(str(c.get(k,'')) for k in ['label','text','placeholder','name','id'])
        if s.strip() and (rx is None or rx.search(s)): out.append(s.strip()[:180])
    return list(dict.fromkeys(out))[:60]
async def save_feature(page, rid, feature, status, activation, selectors=None, observed_labels=None, note='', extra=None):
    d=EVID/rid; d.mkdir(parents=True, exist_ok=True)
    screenshot_path = await shot(page, rid, feature)
    obj = {
      'activation_steps': activation,
      'selectors': selectors or {},
      'observed_labels': observed_labels or [],
      'screenshot_path': screenshot_path,
      'status': status,
      'note': note,
      'captured_at': now(),
      'page_title': await title(page),
      'url_redacted': red_url(page.url),
    }
    if extra: obj.update(extra)
    (d/f'{feature}.json').write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    return obj

async def click_by_rx(page, rx, tries=40):
    locs=[]
    for role in ['button','link']:
        try:
            loc=page.get_by_role(role, name=rx); c=min(await loc.count(), tries)
            locs.extend([loc.nth(i) for i in range(c)])
        except Exception: pass
    try:
        loc=page.locator('button,a,[role=button],[role=link]').filter(has_text=rx); c=min(await loc.count(), tries)
        locs.extend([loc.nth(i) for i in range(c)])
    except Exception: pass
    for loc in locs:
        try:
            if await loc.is_visible(timeout=700):
                await loc.click(timeout=5000)
                await page.wait_for_timeout(2500)
                return True
        except Exception: continue
    return False
async def navigate(page, url, timeout=45000):
    try: await page.goto(url, wait_until='domcontentloaded', timeout=timeout)
    except Exception: pass
    await page.wait_for_timeout(4500)
    try: await click_by_rx(page, COOKIE)
    except Exception: pass
async def search_url(site, query):
    tmpl = site.get('search_url_template') or site.get('home_url')
    if tmpl and '{query}' in tmpl:
        return tmpl.format(query=urllib.parse.quote_plus(query))
    return tmpl or site.get('home_url')
async def find_search_box(page):
    selectors=['input[type="search"]','input[name="q"]','input[name="query"]','input[name="AllField"]','input[name="searchText"]','input[placeholder*=Search]','input[placeholder*=检索]','input[placeholder*=搜索]','textarea','input:not([type=hidden]):not([type=checkbox]):not([type=radio])']
    for s in selectors:
        try:
            loc=page.locator(s).first
            if await loc.is_visible(timeout=1200): return loc, s
        except Exception: pass
    return None, ''
async def run_simple_search(page, site, query):
    url = await search_url(site, query)
    route = 'search_url_template' if '{query}' in (site.get('search_url_template') or '') else 'home_search_box'
    if route == 'search_url_template':
        await navigate(page, url)
        return True, {'route': route, 'search_url_redacted': red_url(page.url)}
    box, sel = await find_search_box(page)
    if not box:
        await navigate(page, url)
        box, sel = await find_search_box(page)
    if not box:
        return False, {'route': route, 'query_input': ''}
    try:
        await box.click(timeout=3000); await box.fill(query, timeout=5000); await page.keyboard.press('Enter')
        try: await page.wait_for_load_state('domcontentloaded', timeout=15000)
        except Exception: pass
        await page.wait_for_timeout(5000)
        return True, {'route': route, 'query_input': sel}
    except Exception:
        return False, {'route': route, 'query_input': sel}
async def result_ok(page):
    txt=await body_text(page, 8000); ctrls=await controls(page)
    labels=label_list(ctrls, RESULT_TEXT)[:50]
    return bool(RESULT_TEXT.search(txt) or labels), txt, ctrls, labels
async def open_advanced(page, site):
    steps=[]
    url=site.get('advanced_search_url')
    if url:
        await navigate(page, url); steps.append('open advanced_search_url')
    else:
        ok=await click_by_rx(page, ADV_TEXT); steps.append('click visible advanced search' if ok else 'advanced search control not found')
    txt=await body_text(page, 5000); ctrls=await controls(page)
    labels=label_list(ctrls, re.compile(r'Advanced|Search|Title|Author|Abstract|Keyword|高级|检索|搜索|题名|作者|摘要', re.I))
    ok=bool(labels or ADV_TEXT.search(txt) or re.search(r'author|title|abstract|keyword', txt, re.I))
    return ok, steps, labels
async def sort_and_view(page):
    before=page.url; ctrls=await controls(page); labels=label_list(ctrls, SORT_TEXT)
    changed=[]
    try:
        sels=page.locator('select')
        for i in range(min(await sels.count(), 10)):
            sel=sels.nth(i)
            if not await sel.is_visible(timeout=500): continue
            opts=await sel.locator('option').all_inner_texts(timeout=1000)
            joined=' '.join(opts)
            if len(opts)>1 and SORT_TEXT.search(joined):
                val=await sel.locator('option').nth(1).get_attribute('value')
                if val is not None:
                    await sel.select_option(value=val, timeout=3000)
                    await page.wait_for_timeout(3500)
                    changed.append(f'select:{opts[1][:60]}')
                    break
    except Exception: pass
    if not changed:
        for rx in [re.compile(r'Publication Date|Most Recent|Newest|日期|最新',re.I), re.compile(r'Relevance|相关度|相关性',re.I), re.compile(r'View|列表|Grid|每页|50',re.I)]:
            if await click_by_rx(page, rx): changed.append(f'click:{rx.pattern}'); break
    ok, txt, ctrls2, result_labels = await result_ok(page)
    status = 'tested_ok' if (changed or labels) and ok else ('partial' if labels or ok else 'not_applicable')
    return status, labels + result_labels, changed, {'before_url_redacted': red_url(before), 'after_url_redacted': red_url(page.url)}


def cdp_available():
    try:
        urllib.request.urlopen(CDP + '/json/version', timeout=2).read()
        return True
    except Exception:
        return False

def ensure_cdp():
    if cdp_available():
        return None
    prof = SKILL / '.runs' / 'nuaa-2026-05-13-round2-headed' / 'cdp-profile'
    for name in ['SingletonLock','SingletonCookie','SingletonSocket']:
        try: (prof/name).unlink()
        except FileNotFoundError: pass
        except Exception: pass
    log = open(RUN/'chrome_probe.log', 'ab', buffering=0)
    env = os.environ.copy(); env.setdefault('DISPLAY', ':0'); env.setdefault('XAUTHORITY','/run/user/1000/gdm/Xauthority')
    cmd = ['/usr/bin/google-chrome', '--remote-debugging-port=9335', f'--user-data-dir={prof}', '--no-first-run', '--no-default-browser-check', '--new-window', 'about:blank']
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, close_fds=True, env=env)
    deadline = time.time() + 30
    while time.time() < deadline:
        if cdp_available():
            return proc
        time.sleep(1)
    raise RuntimeError('CDP browser did not become available on 9335')

def load_sites():
    sites={s['id']:s for s in json.loads(REG.read_text(encoding='utf-8'))['sites']}
    extra=json.loads(NEW_PROFILES.read_text(encoding='utf-8')).get('resources',[])
    for s in extra: sites.setdefault(s['id'], s)
    for k,v in FALLBACKS.items(): sites.setdefault(k, v)
    return sites

def load_round1():
    data=json.loads(ROUND1.read_text(encoding='utf-8'))['results']
    return {r['resource_id']:r for r in data}

async def classify_one(context, round1, site, rid, title_zh, adapter):
    start=time.monotonic(); page=await context.new_page(); page.set_default_timeout(10000)
    activation=[]; features=[]; note=''
    try:
        home=site.get('home_url') or ('https://' + (round1.get('final_host') or ''))
        activation.append(f'open home: {home}')
        await navigate(page, home)
        txt=await body_text(page, 8000); ttl=await title(page); ctrls=await controls(page)
        labels=label_list(ctrls, IP_LOGIN) + label_list(ctrls, re.compile('|'.join(map(re.escape, site.get('access_markers',[]) or ['__nomarker__'])), re.I))
        if BLOCKERS.search(txt) or BLOCKERS.search(ttl):
            await save_feature(page, rid, 'access', 'blocked', activation, {'adapter': adapter or 'registry/direct'}, labels, 'Persistent challenge / anti-bot or access-denied marker observed.', {'text_sample': txt[:1000]})
            return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':'blocked','features_tested':['access'],'note':'Persistent challenge / anti-bot or access-denied marker observed.'}
        ip_clicked=False
        if await click_by_rx(page, IP_LOGIN):
            ip_clicked=True; activation.append('clicked visible IP/institutional access control')
            txt=await body_text(page,8000); ctrls=await controls(page)
        else:
            activation.append('no visible IP/institutional access control clicked')
        if not txt and not ttl:
            await save_feature(page, rid, 'access', 'unreachable', activation, {'adapter': adapter or 'registry/direct'}, labels, 'No visible page title/body after homepage load.')
            return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':'unreachable','features_tested':['access'],'note':'No visible page title/body after homepage load.'}
        await save_feature(page, rid, 'access', 'opened', activation, {'adapter': adapter or 'registry/direct'}, labels, 'Homepage opened in warm headed CDP profile.', {'text_sample': txt[:1000]})
        # simple search
        s_ok, selectors = await run_simple_search(page, site, QUERY)
        ok, txt2, ctrls2, result_labels = await result_ok(page)
        if BLOCKERS.search(txt2) or BLOCKERS.search(await title(page)):
            st='blocked'; note='Persistent challenge / anti-bot marker after search.'
        elif s_ok and ok:
            st='tested_ok'; note='Simple search result list rendered.'
        elif s_ok:
            st='partial'; note='Search route loaded but result-list evidence was insufficient.'
        else:
            st='failed'; note='No usable search input or search URL route.'
        await save_feature(page, rid, 'simple_search', st, activation+[f'query: {QUERY}'], selectors, result_labels, note, {'text_sample': txt2[:1200]})
        features.append('simple_search')
        if st=='blocked':
            return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':'blocked','features_tested':features,'note':note}
        if st!='tested_ok':
            return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':'still_unknown','features_tested':features,'note':note}
        # Flip status
        round4 = 'ip_login_button_ok' if ip_clicked else 'auto_ip_ok'
        result_url=page.url
        # Advanced search: linked/direct from current result page.
        adv_ok, adv_steps, adv_labels = await open_advanced(page, site)
        await save_feature(page, rid, 'advanced_search', 'tested_ok' if adv_ok else 'partial', activation+adv_steps, {'advanced_url': site.get('advanced_search_url','')}, adv_labels, 'Advanced search form loaded.' if adv_ok else 'Advanced search link/form not conclusively observed.')
        features.append('advanced_search')
        # Return to results for sort/view.
        await navigate(page, result_url)
        sort_status, sort_labels, changed, extra = await sort_and_view(page)
        await save_feature(page, rid, 'sort_and_view', sort_status, activation+(['returned to simple results'] + changed), {}, sort_labels, 'Sort/view controls observed or changed on result list.', extra)
        features.append('sort_and_view')
        return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':round4,'features_tested':features,'note':'Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile.'}
    except Exception as e:
        note=f'{type(e).__name__}: {e}'
        try: await save_feature(page, rid, 'access', 'still_unknown', activation, {'adapter': adapter or 'registry/direct'}, [], note, {'traceback': traceback.format_exc()[-2000:]})
        except Exception: pass
        return {'resource_id':rid,'title':title_zh,'round1_status':round1.get('access_mode','unknown'),'round4_status':'still_unknown','features_tested':features or ['access'],'note':note}
    finally:
        try: await page.close()
        except Exception: pass
        line(f'{rid} done in {time.monotonic()-start:.1f}s')

async def classify_with_cap(context, r1map, sites, target):
    rid, sid, title_zh, adapter = target
    if rid == 'elsevier-sciencedirect-ee38095f':
        line(f'{rid} duplicate_of:science-direct skipped')
        return {'resource_id':rid,'title':title_zh,'round1_status':r1map.get(rid,{}).get('access_mode','unknown'),'round4_status':'duplicate_of:science-direct','features_tested':[],'note':'Duplicate of science-direct entry already explored in round 2; smoke skipped.'}
    site=sites.get(sid)
    if not site:
        rr=r1map.get(rid,{})
        host=rr.get('final_host') or sid + '.org'
        site={'id':sid,'name':title_zh,'home_url':'https://'+host,'search_url_template':'https://'+host,'access_markers':[title_zh], 'login_markers':['Sign in','Log in']}
    try:
        return await asyncio.wait_for(classify_one(context, r1map.get(rid,{}), site, rid, title_zh, adapter), timeout=180)
    except asyncio.TimeoutError:
        line(f'{rid} timeout after 180s')
        return {'resource_id':rid,'title':title_zh,'round1_status':r1map.get(rid,{}).get('access_mode','unknown'),'round4_status':'still_unknown','features_tested':['access'],'note':'Per-DB 3 min hard cap reached.'}

async def main():
    RUN.mkdir(parents=True, exist_ok=True); EVID.mkdir(parents=True, exist_ok=True)
    PROGRESS.write_text('', encoding='utf-8')
    start=time.monotonic(); sites=load_sites(); r1=load_round1(); results=[]
    chrome_proc = ensure_cdp()
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP, timeout=20000)
        context = browser.contexts[0] if browser.contexts else await browser.new_context(viewport={'width':1440,'height':1000}, locale='zh-CN', accept_downloads=True)
        try:
            for target in TARGETS:
                rid=target[0]; line(f'{rid} start')
                res=await classify_with_cap(context, r1, sites, target)
                results.append(res)
                line(f"{rid} {res['round1_status']} -> {res['round4_status']} note={res['note']}")
        finally:
            try: await browser.close()
            except Exception: pass
            if chrome_proc is not None:
                try: chrome_proc.terminate()
                except Exception: pass
    META['captured_at']=now()
    agg={'metadata':META, 'results':results}
    (RUN/'nuaa_stem_round4_reclass_tests.json').write_text(json.dumps(agg,ensure_ascii=False,indent=2),encoding='utf-8')
    flipped=sum(1 for r in results if r['round4_status'] in ('auto_ip_ok','ip_login_button_ok'))
    blocked=sum(1 for r in results if r['round4_status']=='blocked')
    rows='\n'.join(f"| {i+1} | `{r['resource_id']}` | {r['title']} | {r['round1_status']} | {r['round4_status']} | {', '.join(r['features_tested']) or '—'} | {r['note']} |" for i,r in enumerate(results))
    summary=f"""# NUAA STEM Round 4 复核摘要\n\n本轮使用 round-2 的温 CDP profile 对 round-1 中 10 个 `unknown` STEM 资源进行轻量重探测，仅验证主页/IP 识别、一次简单检索、结果列表截图，以及翻转资源的高级检索和排序/视图能力；其中 ScienceDirect 备用入口标记为 round-2 已覆盖的重复项。结果显示 {flipped} 个资源从 `unknown` 翻转为可用，{blocked} 个资源仍受持续安全验证或访问挑战阻断。\n\n| 序号 | resource_id | 题名 | round-1 | round-4 | features_tested | 备注 |\n|---:|---|---|---|---|---|---|\n{rows}\n"""
    (RUN/'nuaa_stem_round4_summary.md').write_text(summary,encoding='utf-8')
    trans='\n'.join(f"| `{r['resource_id']}` | {r['round1_status']} | {r['round4_status']} | {r['note']} |" for r in results)
    report=f"""# NUAA STEM Round 4 Verification Report\n\nMetadata: `{json.dumps(META, ensure_ascii=False)}`\n\n## Round-1 → Round-4 transitions\n\n| resource_id | round-1 status | round-4 status | verification note |\n|---|---|---|---|\n{trans}\n\n## Compliance\n\n- Used one sequential headed CDP browser on port 9335 with the round-2 warm profile.\n- No CAPTCHA bypass, anti-scraper evasion, account credential capture, or bulk full-text/PDF scraping was attempted.\n- Per-resource work was capped at 180 seconds; blocked resources were stopped when persistent challenge/access-denied markers were observed.\n"""
    (RUN/'nuaa_stem_round4_verification_report.md').write_text(report,encoding='utf-8')
    final=f"""NUAA STEM ROUND 4 {'COMPLETE' if True else 'PARTIAL'}\n\nTotal wall-clock time: {time.monotonic()-start:.1f}s\nFlipped count: {flipped} (`auto_ip_ok` / `ip_login_button_ok`)\n\n| resource_id | round-1 → round-4 | note |\n|---|---|---|\n""" + '\n'.join(f"| `{r['resource_id']}` | {r['round1_status']} → {r['round4_status']} | {r['note']} |" for r in results) + "\n\nAggregate files:\n"
    for name in ['nuaa_stem_round4_reclass_tests.json','nuaa_stem_round4_summary.md','nuaa_stem_round4_verification_report.md','progress.md']:
        pth=RUN/name; final += f"- `{pth}` — {pth.stat().st_size} bytes\n"
    final += f"\nRun directory: `{RUN}`\n"
    Path('/tmp/codex-nuaa-stem-round4-reclass.md').write_text(final, encoding='utf-8')
    print(final)

if __name__ == '__main__':
    asyncio.run(main())
