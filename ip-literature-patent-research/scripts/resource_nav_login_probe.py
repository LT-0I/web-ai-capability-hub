from __future__ import annotations

import argparse
import asyncio
import csv
import html
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import browser_research_runner as browser_runner  # noqa: E402
import full_research_workflow as full_workflow  # noqa: E402


DEFAULT_REGISTRY = SCRIPT_DIR.parents[0] / "references" / "site_registry.json"
DEFAULT_PROFILE = Path.cwd() / "hba-agent-skills" / ".tmp" / "paid-stem-cdp-user-profile"

NAV_URL_REDACTION = "[REDACTED_NAV_URL]"
NAV_PRIVATE_PARTS = [
    "lib." + "nu" + "aa",
    "nu" + "aa",
    "engine2/m",
    "websiteId=",
    "wfwfid=",
    "pageId=",
]
SENSITIVE_QUERY_KEYS = {"state", "authrequest", "token", "code", "redirect_uri", "requestidentifier"}

SITE_ALIASES = {
    "cnki": ["cnki", "china national knowledge infrastructure"],
    "wanfang": ["wanfang", "wanfangdata"],
    "vip": ["vip", "cqvip"],
    "incopat": ["incopat", "inco pat"],
    "web-of-science": ["web of science", "webofscience", "wos", "clarivate"],
    "scopus": ["scopus"],
    "ei-village": ["engineering village", "ei village", "compendex", "engineeringvillage"],
    "inspec": ["inspec"],
    "science-direct": ["science direct", "sciencedirect"],
    "ieee-xplore": ["ieee xplore", "ieeexplore"],
    "acm-dl": ["acm digital library", "dl.acm"],
    "springer-link": ["springerlink", "springer link"],
    "wiley": ["wiley online library", "wiley"],
    "aiaa": ["aiaa", "aerospace research central"],
    "asce": ["asce library", "asce"],
    "asme": ["asme digital collection", "asme"],
    "astm": ["astm compass", "astm"],
    "sae": ["sae mobilus", "saemobilus"],
    "spie": ["spie digital library", "spie"],
    "iet-digital-library": ["iet digital library", "digital-library.theiet", "the iet"],
    "taylor-francis": ["taylor & francis", "taylor and francis", "tandfonline"],
    "acs": ["acs publications", "pubs.acs"],
    "rsc": ["royal society of chemistry", "pubs.rsc"],
    "iop": ["iopscience", "iop science"],
    "aip": ["aip publishing", "pubs.aip"],
    "aps": ["aps journals", "physical review", "journals.aps"],
    "nature": ["nature portfolio", "nature.com"],
    "science-online": ["science online", "science.org"],
}

RESOURCE_SEARCH_TERMS = {
    "cnki": ["CNKI", "中国知网"],
    "wanfang": ["万方数据", "Wanfang", "万方"],
    "vip": ["CQVIP", "维普"],
    "incopat": ["incoPat", "Incopat"],
    "web-of-science": ["Web of Science"],
    "scopus": ["Scopus"],
    "ei-village": ["Engineering Village", "Compendex", "EI"],
    "inspec": ["Inspec"],
    "science-direct": ["ScienceDirect", "Science Direct", "Elsevier ScienceDirect"],
    "ieee-xplore": ["IEEE Electronic Library", "IEL", "IEEE Xplore"],
    "acm-dl": ["ACM美国计算机协会数据库", "ACM Digital Library", "ACM"],
    "springer-link": ["SpringerLink", "Springer Link", "SpringerLink综合类学术数据库"],
    "wiley": ["Wiley Online Library", "Wiley", "Wiley电子期刊数据库", "Wiley-Blackwell"],
    "aiaa": ["AIAA", "AIAA美国航空航天学会"],
    "asce": ["ASCE Library", "ASCE美国土木工程学会", "ASCE"],
    "asme": ["ASME Digital Collection", "ASME美国机械工程师学会", "ASME"],
    "astm": ["ASTM Compass", "ASTM标准数据库", "ASTM"],
    "sae": ["SAE Mobilus", "SAE国际自动机工程师学会", "SAE"],
    "spie": ["SPIE Digital Library", "SPIE 国际光学工程学会数字图书馆", "SPIE"],
    "iet-digital-library": ["IET Digital Library", "IET（英国工程技术学会）", "IET"],
    "taylor-francis": ["Taylor & Francis科技期刊专辑数据库", "Taylor & Francis", "Taylor and Francis"],
    "acs": ["ACS Publications", "ACS美国化学会", "ACS"],
    "rsc": ["Royal Society of Chemistry", "RSC英国皇家化学学会数据库", "RSC"],
    "iop": ["IOPscience", "IOP英国物理学会", "IOP"],
    "aip": ["AIP Publishing", "AIP美国物理联合会", "AIP"],
    "aps": ["APS Journals", "Physical Review", "APS美国物理学会", "APS"],
    "nature": ["Nature", "Nature系列期刊"],
    "science-online": ["Science Online", "ScienceOnline科学在线", "Science"],
}

CSV_FIELDS = [
    "site_id",
    "site_name",
    "direct_nav_status",
    "final_status",
    "source_link_text",
    "source_link_url",
    "final_url",
    "access_markers_found",
    "login_markers_found",
    "stop_markers_found",
    "probed_at",
    "evidence_path",
]


def now_stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def compact_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value))


def sanitize_nav_url(value: str | None) -> str:
    if not value:
        return ""
    text = str(value)
    low = text.lower()
    if any(part.lower() in low for part in NAV_PRIVATE_PARTS):
        return NAV_URL_REDACTION
    return browser_runner.redact_private_text(text)


def redact_sensitive_query(value: str) -> str:
    if not value.startswith(("http://", "https://")):
        return value
    try:
        parsed = urllib.parse.urlparse(value)
        query = parsed.query
        query_keys = {key.lower() for key in urllib.parse.parse_qs(query).keys()}
        if query and (len(query) > 120 or query_keys & SENSITIVE_QUERY_KEYS):
            return urllib.parse.urlunparse(parsed._replace(query="[REDACTED_QUERY]", fragment=""))
    except Exception:
        return value
    return value


def redact_probe_value(value: Any, key: str | None = None) -> Any:
    if isinstance(value, str):
        if key in {"nav_url"}:
            return sanitize_nav_url(value)
        if any(part.lower() in value.lower() for part in NAV_PRIVATE_PARTS):
            return NAV_URL_REDACTION
        return browser_runner.redact_private_text(redact_sensitive_query(value))
    if isinstance(value, list):
        return [redact_probe_value(item, key=key) for item in value]
    if isinstance(value, dict):
        return {item_key: redact_probe_value(item_value, key=str(item_key)) for item_key, item_value in value.items()}
    return value


def host_candidates(site: dict[str, Any]) -> set[str]:
    hosts: set[str] = set()
    for key in ("home_url", "advanced_search_url", "search_url_template"):
        raw = str(site.get(key) or "")
        if "{query}" in raw:
            raw = raw.replace("{query}", "")
        try:
            host = urllib.parse.urlparse(raw).netloc.lower()
        except Exception:
            host = ""
        if host:
            hosts.add(host.removeprefix("www."))
    for raw in site.get("source_urls") or []:
        try:
            host = urllib.parse.urlparse(str(raw)).netloc.lower()
        except Exception:
            host = ""
        if host:
            hosts.add(host.removeprefix("www."))
    return hosts


def link_matches_site(site: dict[str, Any], link: dict[str, str]) -> bool:
    site_id = str(site.get("id") or "")
    hay_text = normalize_text(f"{link.get('text', '')} {link.get('href', '')}")
    hay_key = compact_key(hay_text)
    site_name = normalize_text(site.get("name"))
    site_key = compact_key(site.get("name"))
    if normalize_text(site_id).replace("-", " ") in hay_text or site_key and site_key in hay_key:
        return True
    if site_name and site_name in hay_text:
        return True
    for alias in SITE_ALIASES.get(site_id, []):
        alias_text = normalize_text(alias)
        if alias_text in hay_text or compact_key(alias_text) in hay_key:
            return True
    href = str(link.get("href") or "")
    try:
        link_host = urllib.parse.urlparse(href).netloc.lower().removeprefix("www.")
    except Exception:
        link_host = ""
    if link_host:
        for host in host_candidates(site):
            if link_host == host or link_host.endswith("." + host) or host in link_host:
                if site_id == "inspec" and "inspec" not in hay_text:
                    return False
                return True
    return False


def search_terms_for_site(site: dict[str, Any]) -> list[str]:
    site_id = str(site.get("id") or "")
    terms = list(RESOURCE_SEARCH_TERMS.get(site_id) or [])
    for value in [site.get("name"), site_id, *(SITE_ALIASES.get(site_id, []) or [])]:
        term = str(value or "").replace("-", " ").strip()
        if term and term not in terms:
            terms.append(term)
    return terms


def private_or_navigation_host(host: str) -> bool:
    low = host.lower()
    return any(part.lower().replace("engine2/m", "") in low for part in NAV_PRIVATE_PARTS if part != "engine2/m")


def is_external_candidate_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    host = parsed.netloc.lower()
    if private_or_navigation_host(host):
        return False
    blocked_hosts = {
        "portal.chaoxing.com",
        "pc.chaoxing.com",
        "p.ananas.chaoxing.com",
    }
    if host in blocked_hosts or host.endswith(".chaoxing.com"):
        return False
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in [".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico"]):
        return False
    return True


def normalize_external_url(raw: str) -> str:
    value = html.unescape(str(raw or "")).strip()
    value = value.rstrip(").,，。；;、")
    return value


def extract_external_urls(text: str, anchors: list[dict[str, str]]) -> list[str]:
    urls: list[str] = []
    for anchor in anchors:
        href = normalize_external_url(str(anchor.get("href") or ""))
        if href and is_external_candidate_url(href):
            urls.append(href)
    for match in re.finditer(r"https?://[^\s\"'<>]+", text or ""):
        url = normalize_external_url(match.group(0))
        if is_external_candidate_url(url):
            urls.append(url)
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        unique.append(url)
    return unique


def choose_external_url_for_site(site: dict[str, Any], urls: list[str]) -> str | None:
    for url in urls:
        if link_matches_site(site, {"text": "", "href": url}):
            return url
    site_id = str(site.get("id") or "")
    hay_aliases = [compact_key(alias) for alias in SITE_ALIASES.get(site_id, [])]
    for url in urls:
        url_key = compact_key(url)
        if any(alias and alias in url_key for alias in hay_aliases):
            return url
    return urls[0] if urls else None


def preferred_site_ids(registry: dict[str, Any], raw_sites: str | None = None) -> list[str]:
    if raw_sites:
        return browser_runner.split_list(raw_sites)
    return full_workflow.paid_stem_site_ids(registry)


def match_paid_stem_links(
    registry: dict[str, Any],
    links: list[dict[str, str]],
    site_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    wanted = site_ids or preferred_site_ids(registry)
    sites = {str(site.get("id")): site for site in registry.get("sites", []) if str(site.get("id")) in set(wanted)}
    matched: list[dict[str, Any]] = []
    seen: set[str] = set()
    for link in links:
        href = str(link.get("href") or "")
        text = str(link.get("text") or "").strip()
        if not href and not text:
            continue
        for site_id in wanted:
            if site_id in seen or site_id not in sites:
                continue
            if link_matches_site(sites[site_id], link):
                matched.append(
                    {
                        "site_id": site_id,
                        "site_name": sites[site_id].get("name") or site_id,
                        "source_link_text": text,
                        "source_link_url": href,
                        "site": sites[site_id],
                    }
                )
                seen.add(site_id)
                break
    return matched


def strong_authenticated_markers(site_id: str, title: str, text: str) -> bool:
    combined = normalize_text(f"{title} {text[:20000]}")
    checks = {
        "web-of-science": ["web of science", "all databases"],
        "scopus": ["scopus", "document search"],
        "ei-village": ["engineering village", "compendex"],
        "inspec": ["inspec", "engineering village"],
        "cnki": ["cnki"],
        "wanfang": ["wanfang"],
        "vip": ["cqvip"],
        "incopat": ["incopat", "simple search"],
    }
    return any(all(part in combined for part in phrase.split("|")) for phrase in checks.get(site_id, []))


def classify_login_evidence(
    site: dict[str, Any],
    title: str,
    text: str,
    final_url: str,
    elements: list[dict[str, Any]] | None = None,
    status_hint: str | None = None,
) -> dict[str, Any]:
    state = browser_runner.classify_page_state(site, title, text, status_hint=status_hint)
    site_id = str(site.get("id") or "")
    element_text = " ".join(
        str(item.get("text") or item.get("aria_label") or item.get("placeholder") or "") for item in (elements or [])[:120]
    )
    combined = normalize_text(f"{title} {text[:20000]} {element_text}")
    access_hits = list(state.get("access_markers_found") or [])
    login_hits = list(state.get("login_markers_found") or [])
    stop_hits = list(state.get("stop_markers_found") or [])
    if stop_hits:
        status = "needs_human_or_blocked"
    elif state.get("status") in {"navigation_error", "empty_page_after_navigation"}:
        status = str(state.get("status"))
    elif final_url.startswith("chrome-error://") or sanitize_nav_url(final_url) == NAV_URL_REDACTION:
        status = "navigation_error"
    elif site_id == "incopat" and login_hits and "free trial" in combined and "simple search" not in combined and "advanced search" not in combined:
        status = "login_required_or_unknown"
    elif access_hits or strong_authenticated_markers(site_id, title, f"{text} {element_text}"):
        status = "authenticated_or_ip_access"
    elif login_hits:
        status = "login_required_or_unknown"
    else:
        status = "reachable_unknown"
    return {
        "status": status,
        "raw_status": state.get("status"),
        "access_markers_found": sorted(set(access_hits)),
        "login_markers_found": sorted(set(login_hits)),
        "stop_markers_found": sorted(set(stop_hits)),
    }


async def collect_navigation_links(page: Any, nav_url: str, args: argparse.Namespace) -> list[dict[str, str]]:
    await page.goto(nav_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
    await browser_runner.wait_settle(page, args.timeout_ms)
    if args.manual_wait_seconds > 0:
        await page.wait_for_timeout(args.manual_wait_seconds * 1000)
    links = await browser_runner.collect_anchors(page)
    normalized: list[dict[str, str]] = []
    for index, item in enumerate(links):
        text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()
        href = str(item.get("href") or "").strip()
        if not text and not href:
            continue
        normalized.append({"index": str(index), "text": text, "href": href})
    return normalized


RESOURCE_ROW_SELECTOR = "table.list tbody tr, table tbody tr"


async def collect_resource_rows(page: Any) -> list[dict[str, str]]:
    try:
        return await page.evaluate(
            """(selector) => Array.from(document.querySelectorAll(selector)).map((row, index) => {
                const cells = Array.from(row.querySelectorAll('td')).map(td => (td.innerText || td.textContent || '').replace(/\\s+/g, ' ').trim());
                return {
                    index: String(index),
                    title: cells[0] || '',
                    row_text: cells.join(' | '),
                    subject: cells[2] || '',
                    resource_type: cells[3] || ''
                };
            }).filter(item => item.title || item.row_text)""",
            RESOURCE_ROW_SELECTOR,
        )
    except Exception:
        return []


def choose_resource_row(site: dict[str, Any], rows: list[dict[str, str]]) -> dict[str, str] | None:
    site_id = str(site.get("id") or "")
    if site_id == "aiaa":
        main_rows = [
            row for row in rows
            if "video library" not in normalize_text(row.get("row_text") or row.get("title") or "")
            and "视频图书馆" not in (row.get("row_text") or row.get("title") or "")
        ]
        if main_rows:
            rows = main_rows
    preferred_phrases = {
        "aiaa": ["AIAA美国航空航天学会"],
        "wanfang": ["万方数据"],
        "ei-village": ["Ei Village", "工程索引"],
        "vip": ["维普中文科技期刊"],
    }
    for phrase in preferred_phrases.get(site_id, []):
        phrase_key = compact_key(phrase)
        for row in rows:
            row_text = row.get("row_text") or row.get("title") or ""
            if phrase in row_text or phrase_key in compact_key(row_text):
                return row
    for row in rows:
        if link_matches_site(site, {"text": row.get("row_text") or row.get("title") or "", "href": ""}):
            return row
    return rows[0] if len(rows) == 1 else None


async def search_navigation_for_rows(page: Any, nav_url: str, term: str, args: argparse.Namespace) -> list[dict[str, str]]:
    await page.goto(nav_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
    await page.wait_for_timeout(1500)
    try:
        search_box = page.locator("input#searchInput-custom").first
        await search_box.fill("")
        await search_box.fill(term)
        await page.locator("button.btn-search").first.click(timeout=5000)
    except Exception:
        return []
    await page.wait_for_timeout(2500)
    return await collect_resource_rows(page)


async def open_resource_detail_page(nav_page: Any, row_index: int, args: argparse.Namespace) -> Any | None:
    row = nav_page.locator(RESOURCE_ROW_SELECTOR).nth(row_index)
    detail = row.locator("a.txt-theme").first
    try:
        async with nav_page.expect_popup(timeout=7000) as popup_info:
            await detail.click(timeout=5000)
        detail_page = await popup_info.value
        await detail_page.wait_for_load_state("domcontentloaded", timeout=args.timeout_ms)
        await browser_runner.wait_settle(detail_page, args.timeout_ms)
        return detail_page
    except Exception:
        try:
            await detail.click(timeout=5000)
            await browser_runner.wait_settle(nav_page, args.timeout_ms)
            return nav_page
        except Exception:
            return None


async def resolve_navigation_entry_for_site(
    nav_page: Any,
    nav_url: str,
    site: dict[str, Any],
    args: argparse.Namespace,
) -> dict[str, Any] | None:
    for term in search_terms_for_site(site):
        rows = await search_navigation_for_rows(nav_page, nav_url, term, args)
        row = choose_resource_row(site, rows)
        if not row:
            continue
        detail_page = await open_resource_detail_page(nav_page, int(row.get("index") or 0), args)
        if detail_page is None:
            continue
        try:
            detail_title = await detail_page.title()
        except Exception:
            detail_title = ""
        try:
            detail_text = await detail_page.locator("body").inner_text(timeout=5000)
        except Exception:
            detail_text = ""
        anchors = await browser_runner.collect_anchors(detail_page)
        external_urls = extract_external_urls(detail_text, anchors)
        chosen_url = choose_external_url_for_site(site, external_urls)
        detail_url = getattr(detail_page, "url", "")
        if detail_page is not nav_page:
            try:
                await detail_page.close()
            except Exception:
                pass
        if chosen_url:
            return {
                "site_id": str(site["id"]),
                "site_name": site.get("name") or site["id"],
                "source_link_text": row.get("title") or term,
                "source_link_url": chosen_url,
                "resource_detail_url": detail_url,
                "detail_title": detail_title,
                "detail_search_term": term,
                "detail_external_urls": external_urls[:12],
                "site": site,
            }
    return None


async def locate_navigation_title_match(
    nav_page: Any,
    nav_url: str,
    site: dict[str, Any],
    args: argparse.Namespace,
) -> dict[str, Any] | None:
    for term in search_terms_for_site(site):
        rows = await search_navigation_for_rows(nav_page, nav_url, term, args)
        row = choose_resource_row(site, rows)
        if not row:
            continue
        return {
            "site_id": str(site["id"]),
            "site_name": site.get("name") or site["id"],
            "source_link_text": row.get("title") or term,
            "source_link_url": "[NAVIGATION_TITLE_CLICK]",
            "navigation_title_click": True,
            "detail_search_term": term,
            "resource_row": row,
            "site": site,
        }
    return None


async def open_navigation_title_entry(
    context: Any,
    nav_url: str,
    site: dict[str, Any],
    args: argparse.Namespace,
    preferred_term: str | None = None,
) -> tuple[Any | None, Any | None, dict[str, Any]]:
    terms = []
    if preferred_term:
        terms.append(preferred_term)
    terms.extend(term for term in search_terms_for_site(site) if term not in terms)
    last_meta: dict[str, Any] = {"action": "navigation_title_click", "status": "not_found"}
    for term in terms:
        nav_page = await context.new_page()
        rows = await search_navigation_for_rows(nav_page, nav_url, term, args)
        row = choose_resource_row(site, rows)
        if not row:
            await nav_page.close()
            last_meta = {"action": "navigation_title_click", "term": term, "status": "row_not_found"}
            continue
        row_index = int(row.get("index") or 0)
        title_cell = nav_page.locator(RESOURCE_ROW_SELECTOR).nth(row_index).locator("td").first
        before_pages = set(context.pages)
        try:
            async with nav_page.expect_popup(timeout=8000) as popup_info:
                await title_cell.click(timeout=5000)
            target_page = await popup_info.value
            await target_page.wait_for_load_state("domcontentloaded", timeout=min(args.timeout_ms, 15000))
            await target_page.wait_for_timeout(3000)
            return target_page, nav_page, {
                "action": "navigation_title_click",
                "term": term,
                "row": row,
                "status": "popup_opened",
            }
        except Exception as exc:
            await nav_page.wait_for_timeout(5000)
            new_pages = [page for page in context.pages if page not in before_pages]
            target_page = new_pages[-1] if new_pages else nav_page
            await target_page.wait_for_timeout(3000)
            return target_page, (None if target_page is nav_page else nav_page), {
                "action": "navigation_title_click",
                "term": term,
                "row": row,
                "status": "same_page_or_late_popup",
                "popup_wait_error": str(exc),
            }
    return None, None, last_meta


async def probe_one_site(context: Any, match: dict[str, Any], args: argparse.Namespace, out_dir: Path) -> dict[str, Any]:
    site = dict(match["site"])
    site_id = str(site["id"])
    site_dir = out_dir / "evidence" / browser_runner.safe_name(site_id)
    site_dir.mkdir(parents=True, exist_ok=True)
    source_url = str(match.get("source_link_url") or site.get("home_url") or "")
    page = None
    nav_page_to_close = None
    actions: list[dict[str, Any]] = []
    status_hint = None
    started = time.monotonic()

    if match.get("navigation_title_click"):
        page, nav_page_to_close, click_meta = await open_navigation_title_entry(
            context,
            args.nav_url,
            site,
            args,
            preferred_term=str(match.get("detail_search_term") or ""),
        )
        actions.append(click_meta)
        if page is None:
            status_hint = "navigation_error"
            page = await context.new_page()
            await page.goto("about:blank")
    else:
        page = await context.new_page()
        try:
            await page.goto(source_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
            actions.append({"action": "goto_source_link", "url": source_url})
            await browser_runner.wait_settle(page, args.timeout_ms)
        except Exception as exc:
            status_hint = "navigation_error"
            actions.append({"action": "goto_source_link_error", "url": source_url, "error": str(exc)})

    title = ""
    text = ""
    final_url = ""
    elements: list[dict[str, Any]] = []
    try:
        title = await page.title()
    except Exception:
        title = ""
    try:
        text = await page.locator("body").inner_text(timeout=5000)
    except Exception:
        text = ""
    try:
        final_url = page.url
    except Exception:
        final_url = ""
    try:
        elements = await browser_runner.collect_interactive_dom(page, limit=args.element_limit)
    except Exception:
        elements = []

    direct_state = classify_login_evidence(site, title, text, final_url, elements, status_hint=status_hint)
    final_state = dict(direct_state)
    ip_action: dict[str, Any] | None = None
    post_login_title = title
    post_login_text = text
    post_login_url = final_url
    post_login_elements = elements

    if args.try_ip_login and direct_state["status"] not in {"authenticated_or_ip_access", "needs_human_or_blocked"}:
        try:
            ip_action = await browser_runner.click_ip_access_if_present(page, site)
            actions.append(ip_action)
            post_login_title = await page.title()
            try:
                post_login_text = await page.locator("body").inner_text(timeout=5000)
            except Exception:
                post_login_text = ""
            post_login_url = page.url
            post_login_elements = await browser_runner.collect_interactive_dom(page, limit=args.element_limit)
            final_state = classify_login_evidence(site, post_login_title, post_login_text, post_login_url, post_login_elements)
        except Exception as exc:
            actions.append({"action": "try_ip_login_error", "error": str(exc)})

    evidence = {
        "generated_at": now_stamp(),
        "site_id": site_id,
        "site_name": site.get("name") or site_id,
        "source_link_text": match.get("source_link_text") or "",
        "source_link_url": source_url,
        "navigation_title_click": bool(match.get("navigation_title_click")),
        "resource_row": match.get("resource_row"),
        "resource_detail_url": match.get("resource_detail_url"),
        "detail_search_term": match.get("detail_search_term"),
        "final_url": post_login_url,
        "direct_nav_state": direct_state,
        "state": final_state,
        "ip_login_action": ip_action,
        "title": post_login_title,
        "text_sample": post_login_text[:2500],
        "elements_sample": post_login_elements[:80],
        "actions": actions,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }
    evidence = redact_probe_value(evidence)
    evidence_path = site_dir / f"{site_id}_nav_login_evidence.json"
    evidence["evidence_path"] = str(evidence_path)
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    await page.close()
    if nav_page_to_close is not None:
        try:
            await nav_page_to_close.close()
        except Exception:
            pass
    return evidence


def timeout_evidence(match: dict[str, Any], out_dir: Path, timeout_ms: int) -> dict[str, Any]:
    site = dict(match["site"])
    site_id = str(site["id"])
    site_dir = out_dir / "evidence" / browser_runner.safe_name(site_id)
    site_dir.mkdir(parents=True, exist_ok=True)
    evidence = redact_probe_value(
        {
            "generated_at": now_stamp(),
            "site_id": site_id,
            "site_name": site.get("name") or site_id,
            "source_link_text": match.get("source_link_text") or "",
            "source_link_url": match.get("source_link_url") or "",
            "navigation_title_click": bool(match.get("navigation_title_click")),
            "resource_row": match.get("resource_row"),
            "resource_detail_url": match.get("resource_detail_url"),
            "detail_search_term": match.get("detail_search_term"),
            "final_url": "",
            "direct_nav_state": {"status": "timeout", "raw_status": "timeout"},
            "state": {"status": "timeout", "raw_status": "timeout"},
            "ip_login_action": None,
            "title": "",
            "text_sample": "",
            "elements_sample": [],
            "actions": [{"action": "site_timeout", "timeout_ms": timeout_ms}],
            "elapsed_ms": timeout_ms,
        }
    )
    evidence_path = site_dir / f"{site_id}_nav_login_evidence.json"
    evidence["evidence_path"] = str(evidence_path)
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    return evidence


def write_discovery_report(
    links: list[dict[str, str]],
    matches: list[dict[str, Any]],
    out_dir: Path,
    nav_url: str,
) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    public_matches = [
        {key: value for key, value in match.items() if key != "site"} for match in matches
    ]
    payload = redact_probe_value(
        {
            "generated_at": now_stamp(),
            "nav_url": nav_url,
            "link_count": len(links),
            "matched_count": len(matches),
            "links": links,
            "matches": public_matches,
        }
    )
    links_path = out_dir / "navigation_links.json"
    links_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"navigation_links_json": str(links_path)}


def write_probe_report(probe_results: list[dict[str, Any]], out_dir: Path, nav_url: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    redacted_results = [redact_probe_value(item) for item in probe_results]
    summary: dict[str, int] = {}
    for item in redacted_results:
        status = str((item.get("state") or {}).get("status") or item.get("direct_nav_status") or "unknown")
        summary[status] = summary.get(status, 0) + 1
    payload = {
        "generated_at": now_stamp(),
        "nav_url": sanitize_nav_url(nav_url),
        "summary": summary,
        "sites": redacted_results,
    }
    json_path = out_dir / "access_matrix.json"
    csv_path = out_dir / "access_matrix.csv"
    md_path = out_dir / "access_matrix.md"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for item in redacted_results:
            direct_state = item.get("direct_nav_state") or {}
            final_state = item.get("state") or {}
            writer.writerow(
                {
                    "site_id": item.get("site_id"),
                    "site_name": item.get("site_name"),
                    "direct_nav_status": direct_state.get("status") or item.get("direct_nav_status"),
                    "final_status": final_state.get("status"),
                    "source_link_text": item.get("source_link_text"),
                    "source_link_url": item.get("source_link_url"),
                    "final_url": item.get("final_url"),
                    "access_markers_found": "; ".join(final_state.get("access_markers_found") or item.get("access_markers_found") or []),
                    "login_markers_found": "; ".join(final_state.get("login_markers_found") or item.get("login_markers_found") or []),
                    "stop_markers_found": "; ".join(final_state.get("stop_markers_found") or item.get("stop_markers_found") or []),
                    "probed_at": item.get("generated_at"),
                    "evidence_path": item.get("evidence_path"),
                }
            )

    lines = [
        "# Navigation Login Access Matrix",
        "",
        f"- generated_at: {payload['generated_at']}",
        f"- nav_url: {payload['nav_url']}",
        "",
        "| Site | Direct navigation | Final status | Evidence |",
        "|---|---:|---:|---|",
    ]
    for item in redacted_results:
        direct_state = item.get("direct_nav_state") or {}
        final_state = item.get("state") or {}
        site_name = str(item.get("site_name") or item.get("site_id") or "")
        evidence_path = str(item.get("evidence_path") or "")
        lines.append(
            f"| {site_name} | {direct_state.get('status') or item.get('direct_nav_status') or ''} | "
            f"{final_state.get('status') or ''} | {evidence_path} |"
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {
        "access_matrix_json": str(json_path),
        "access_matrix_csv": str(csv_path),
        "access_matrix_md": str(md_path),
    }


async def run_probe_async(args: argparse.Namespace) -> dict[str, str]:
    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        raise SystemExit("Playwright is required. Install with: python -m pip install playwright") from exc

    registry = browser_runner.load_json(Path(args.registry))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(args.profile_dir)
    launched_proc = None
    if args.launch_cdp:
        launched_proc = browser_runner.launch_cdp_browser_process(args, profile_dir)
    endpoint = browser_runner.cdp_endpoint_from_args(args)
    if not endpoint:
        raise SystemExit("Use --launch-cdp or --cdp-endpoint for headed navigation probes.")

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(endpoint)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        nav_page = context.pages[0] if context.pages else await context.new_page()
        links = await collect_navigation_links(nav_page, args.nav_url, args)
        wanted_site_ids = preferred_site_ids(registry, args.sites)
        anchor_matches = match_paid_stem_links(registry, links, wanted_site_ids)
        matches_by_id = {str(match["site_id"]): match for match in anchor_matches}
        sites_by_id = {str(site.get("id")): site for site in registry.get("sites", [])}
        if args.resolve_titles:
            for site_id in wanted_site_ids:
                site = sites_by_id.get(site_id)
                if not site:
                    continue
                try:
                    title_match = await asyncio.wait_for(
                        locate_navigation_title_match(nav_page, args.nav_url, site, args),
                        timeout=max(1, args.resolve_timeout_ms / 1000),
                    )
                except asyncio.TimeoutError:
                    title_match = None
                if title_match:
                    matches_by_id[site_id] = title_match
        elif args.resolve_details:
            for site_id in wanted_site_ids:
                site = sites_by_id.get(site_id)
                if not site:
                    continue
                try:
                    detail_match = await asyncio.wait_for(
                        resolve_navigation_entry_for_site(nav_page, args.nav_url, site, args),
                        timeout=max(1, args.resolve_timeout_ms / 1000),
                    )
                except asyncio.TimeoutError:
                    detail_match = None
                if detail_match:
                    matches_by_id[site_id] = detail_match
        matches = [matches_by_id[site_id] for site_id in wanted_site_ids if site_id in matches_by_id]
        discovery_outputs = write_discovery_report(links, matches, out_dir, args.nav_url)
        if args.discover_only:
            if launched_proc is not None and args.close_launched_cdp:
                launched_proc.terminate()
            return discovery_outputs

        results = []
        for match in matches:
            try:
                result = await asyncio.wait_for(
                    probe_one_site(context, match, args, out_dir),
                    timeout=max(1, args.site_timeout_ms / 1000),
                )
            except asyncio.TimeoutError:
                result = timeout_evidence(match, out_dir, args.site_timeout_ms)
            results.append(result)
        outputs = write_probe_report(results, out_dir, args.nav_url)
        outputs.update(discovery_outputs)

    if launched_proc is not None and args.close_launched_cdp:
        launched_proc.terminate()
    return outputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe paid STEM database login state through an online resource navigation page.")
    parser.add_argument("--nav-url", required=True, help="Online digital-resource navigation URL. Redacted in outputs.")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--sites", help="Semicolon/comma separated site ids. Defaults to configured paid STEM sites.")
    parser.add_argument("--out-dir", type=Path, default=Path.cwd() / "hba-agent-skills" / ".tmp" / "nav_login_probe")
    parser.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--timeout-ms", type=int, default=45000)
    parser.add_argument("--site-timeout-ms", type=int, default=90000)
    parser.add_argument("--resolve-timeout-ms", type=int, default=45000)
    parser.add_argument("--manual-wait-seconds", type=int, default=0)
    parser.add_argument("--element-limit", type=int, default=500)
    parser.add_argument("--discover-only", action="store_true")
    parser.add_argument("--resolve-titles", dest="resolve_titles", action="store_true", default=True)
    parser.add_argument("--no-resolve-titles", dest="resolve_titles", action="store_false")
    parser.add_argument("--resolve-details", dest="resolve_details", action="store_true", default=False)
    parser.add_argument("--no-resolve-details", dest="resolve_details", action="store_false")
    parser.add_argument("--try-ip-login", action="store_true", help="After direct navigation, try visible IP/institution login controls.")
    parser.add_argument("--headless", action="store_true", help="Launch CDP Chromium headlessly when a visible display is unavailable.")
    browser_runner.add_cdp_arguments(parser)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    outputs = asyncio.run(run_probe_async(args))
    print(json.dumps(outputs, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
