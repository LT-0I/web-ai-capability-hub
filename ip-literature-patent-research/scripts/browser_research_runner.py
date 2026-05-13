from __future__ import annotations

import argparse
import hashlib
import html as html_lib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references" / "site_registry.json"
DEFAULT_PROFILE = Path.cwd() / "hba-agent-skills" / ".tmp" / "ip-literature-browser-profile"
DEFAULT_CDP_PORT = 9333

GENERIC_SEARCH_SELECTORS = [
    "input[type='search']",
    "input[type='text']",
    "input:not([type])",
    "textarea",
    "[contenteditable='true']",
]

IP_ACCESS_TEXTS = [
    "IP登录",
    "IP 登陆",
    "IP登陆",
    "IP Login",
    "IP access",
    "IP Access",
    "IP Authentication",
    "Institution",
    "Institutional Login",
    "Institutional sign in",
    "Institutional Sign In",
    "Institutional access",
    "Institutional Access",
    "Institution login",
    "Login via institution",
    "Sign in via institution",
    "Access through your institution",
    "Access through institution",
    "Check access",
    "Find your institution",
    "Select your institution",
    "Remote access",
    "Library access",
    "通过机构访问",
    "机构登录",
    "机构登陆",
    "机构访问",
    "机构用户",
    "校外访问",
    "馆外访问",
    "CARSI",
    "Shibboleth",
    "OpenAthens",
    "WAYF",
]

STOP_MARKERS = [
    "captcha",
    "access denied",
    "forbidden",
    "just a moment",
    "error 403",
    "403 forbidden",
    "unable to load page",
    "error code: 418",
    "unusual traffic",
    "abnormal download",
    "rate limit",
    "too many requests",
    "error with your entitlements",
    "dberrormsg",
    "验证码",
    "访问过于频繁",
    "IP黑名单",
    "异常下载",
]

PRIVACY_REDACTION_PATTERNS = [
    re.compile(re.escape("lib." + "nu" + "aa") + r"(?:\.[A-Za-z0-9_.-]+)?", re.I),
    re.compile(r"\b" + re.escape("nu" + "aa") + r"\b", re.I),
    re.compile(r"\b" + re.escape("njhk" + "htdx") + r"\b", re.I),
    re.compile(r"\b" + "Nanjing" + r"\s+University\s+of\s+Aeronautics\s+(?:and|&(?:amp;)?)\s+Astronautics\b", re.I),
    re.compile(r"\b" + "Nanjing" + r"\s+Univ\.?,?\s+Aeronautics\s+(?:and|&(?:amp;)?)\s+Astronautics\b", re.I),
    re.compile(r"(?:IP[_\s-]*)?" + "Nanjing" + r"\s+University\s+of\s+Aeronautics(?:\s+(?:and|&(?:amp;)?)\s+|\s+)Astronautic\w*", re.I),
    re.compile(r"\b" + "Nanjing" + r"\s+University\s+of\s+Aeronau\w*(?:\s+[A-Za-z&]+){0,4}", re.I),
    re.compile(r"\b" + "Nanjing" + r"\s+University\s+of\s+Aeronaut\w*(?:\s+[A-Za-z&]+){0,4}", re.I),
    re.compile(re.escape("南京" + "航空航天大学图书馆")),
    re.compile(re.escape("南京" + "航空航天大学")),
    re.compile(re.escape("南" + "航")),
]

SENSITIVE_METADATA_PATTERNS = [
    re.compile(
        r'(?i)("(?:accountid|accountId|accountNumber|departmentId|webUserId|sessionId|searchToken|ddmToken|ip|upc|usageInfo)"\s*:\s*)"[^"]*"'
    ),
    re.compile(r"(?i)((?:accountid|accountId|sessionId|searchToken|ddmToken|_csrf|t:ac)=)[^&\s\"'<>,]+"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
]

RESULT_HREF_HINTS = {
    "springer-link": ["/article/", "/chapter/", "/book/", "/protocol/", "/referenceworkentry/"],
    "ieee-xplore": ["/document/"],
    "acm-dl": ["/doi/", "/proceedings/"],
    "science-direct": ["/science/article/"],
    "wiley": ["/doi/", "/book/"],
    "cnki": ["kns.cnki.net/kcms", "kns.cnki.net/kcms2"],
    "wanfang": ["/periodical/", "/thesis/", "/conference/", "/patent/"],
    "vip": ["/qk/", "/article/detail", "/doc/"],
    "patentscope": ["detail.jsf", "docId="],
    "espacenet": ["/patent/"],
    "incopat": ["/patent/detail", "/detail", "openDetailedInfo("],
    "proquest-csa": ["/docview/"],
    "annual-reviews": ["/content/journals/10.", "/doi/"],
    "crc-books": ["/books/", "/chapters/"],
    "cup-journals": ["/core/journals/"],
    "cup-books": ["/core/books/"],
    "sage": ["/doi/"],
    "siam": ["/doi/"],
    "woodhead": ["/science/article/", "/book/", "/books/"],
    "emerald": ["/insight/content/doi/"],
    "rtca": ["/standards/publications/", "/training/do-"],
}

EXPORT_WORDS = ["export", "download results", "csv", "ris", "bibtex", "导出", "下载"]

LOGIN_MARKERS = [
    "sign in",
    "log in",
    "institutional login",
    "access through your institution",
    "登录",
    "机构登录",
]

RESULT_COUNT_PATTERNS = [
    r"about\s+([\d,]+)\s+results?",
    r"([\d,]+)\s+results?",
    r"([\d,]+)\s+documents?",
    r"找到\s*([\d,，,]+)\s*条",
    r"检索到\s*([\d,，,]+)",
    r"共\s*([\d,，,]+)\s*条",
    r"结果\s*[:：]?\s*([\d,，,]+)",
]


def now_stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def redact_private_text(text: str) -> str:
    redacted = text
    for pattern in PRIVACY_REDACTION_PATTERNS:
        redacted = pattern.sub("[REDACTED_INSTITUTION]", redacted)
    for pattern in SENSITIVE_METADATA_PATTERNS:
        if pattern.groups:
            redacted = pattern.sub(r"\1[REDACTED_PRIVATE_VALUE]", redacted)
        else:
            redacted = pattern.sub("[REDACTED_PRIVATE_VALUE]", redacted)
    return redacted


def redact_json_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_private_text(value)
    if isinstance(value, list):
        return [redact_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: redact_json_value(item) for key, item in value.items()}
    return value


def normalize_cdp_endpoint(endpoint: str) -> str:
    return endpoint.rstrip("/")


def cdp_endpoint_from_args(args: argparse.Namespace) -> str | None:
    if getattr(args, "cdp_endpoint", None):
        return normalize_cdp_endpoint(str(args.cdp_endpoint))
    if getattr(args, "launch_cdp", False):
        return f"http://127.0.0.1:{int(args.cdp_port)}"
    return None


def cdp_json_version_url(endpoint: str) -> str:
    return normalize_cdp_endpoint(endpoint) + "/json/version"


def cdp_json_new_url(endpoint: str, url: str) -> str:
    return normalize_cdp_endpoint(endpoint) + "/json/new?" + urllib.parse.quote(url, safe=":/?&=%#")


def cdp_is_available(endpoint: str, timeout_sec: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(cdp_json_version_url(endpoint), timeout=timeout_sec) as response:
            return response.status == 200
    except Exception:
        return False


def wait_for_cdp(endpoint: str, timeout_ms: int) -> None:
    deadline = time.monotonic() + max(timeout_ms, 1000) / 1000
    last_error = ""
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(cdp_json_version_url(endpoint), timeout=1.5) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.4)
    raise RuntimeError(f"CDP endpoint did not become ready: {endpoint}; last error: {last_error}")


def open_urls_in_cdp(endpoint: str, urls: list[str]) -> list[dict[str, Any]]:
    opened = []
    for url in urls:
        try:
            request = urllib.request.Request(cdp_json_new_url(endpoint, url), method="PUT")
            with urllib.request.urlopen(request, timeout=5) as response:
                body = response.read(20000).decode("utf-8", errors="replace")
            opened.append({"url": url, "status": "opened", "response": body[:500]})
        except Exception as exc:
            opened.append({"url": url, "status": "open_failed", "error": str(exc)})
    return opened


def browser_executable_candidates(channel: str | None) -> list[Path]:
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    program_files = [Path(value) for value in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")) if value]
    candidates: list[Path] = []
    wants_edge = str(channel or "").lower() in {"msedge", "edge", "microsoft-edge"}
    wants_chrome = not wants_edge
    if wants_chrome:
        candidates.extend(base / "Google" / "Chrome" / "Application" / "chrome.exe" for base in program_files)
        candidates.append(local / "Google" / "Chrome" / "Application" / "chrome.exe")
    if wants_edge:
        candidates.extend(base / "Microsoft" / "Edge" / "Application" / "msedge.exe" for base in program_files)
        candidates.append(local / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    return candidates


def find_browser_executable(channel: str | None, explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if path.exists():
            return path
        raise RuntimeError(f"Browser executable not found: {path}")
    for path in browser_executable_candidates(channel):
        if path.exists():
            return path
    raise RuntimeError("Could not find Chrome/Edge executable. Pass --browser-executable.")


def build_cdp_launch_command(executable: Path, profile_dir: Path, args: argparse.Namespace) -> list[str]:
    command = [
        str(executable),
        f"--remote-debugging-port={int(args.cdp_port)}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
    ]
    if getattr(args, "headless", False):
        command.append("--headless=new")
    open_urls = list(getattr(args, "open_url", None) or [])
    command.extend(open_urls or ["about:blank"])
    return command


def launch_cdp_browser_process(args: argparse.Namespace, profile_dir: Path) -> subprocess.Popen[Any] | None:
    endpoint = f"http://127.0.0.1:{int(args.cdp_port)}"
    if cdp_is_available(endpoint):
        return None
    executable = find_browser_executable(getattr(args, "channel", None), getattr(args, "browser_executable", None))
    profile_dir.mkdir(parents=True, exist_ok=True)
    command = build_cdp_launch_command(executable, profile_dir, args)
    proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    wait_for_cdp(endpoint, int(args.timeout_ms))
    return proc


def split_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in re.split(r"[;,，；\n]+", raw) if part.strip()]


def find_site(registry: dict[str, Any], site_id: str) -> dict[str, Any]:
    for site in registry.get("sites", []):
        if site.get("id") == site_id:
            return site
    raise SystemExit(f"Unknown site id: {site_id}")


def default_sites(mode: str) -> list[str]:
    if mode == "patent":
        return ["incopat", "patentscope", "espacenet"]
    if mode == "literature":
        return ["cnki", "web-of-science", "scopus", "ieee-xplore", "springer-link"]
    return ["incopat", "patentscope", "cnki", "web-of-science", "ieee-xplore", "springer-link"]


def plan_query(plan: dict[str, Any]) -> str:
    if plan.get("query"):
        return str(plan["query"])
    keywords = plan.get("keywords") or []
    if isinstance(keywords, str):
        keywords = split_list(keywords)
    return " AND ".join(f'"{kw}"' if " " in str(kw) else str(kw) for kw in keywords)


def build_search_url(site: dict[str, Any], query: str) -> tuple[str, bool]:
    template = str(site.get("search_url_template") or site.get("home_url") or "")
    if "{query}" in template:
        return template.format(query=urllib.parse.quote_plus(query)), True
    return template or str(site["home_url"]), False


def build_navigation_plan(site: dict[str, Any], query: str) -> dict[str, Any]:
    search_url, direct_query = build_search_url(site, query)
    ip_login_before_search = bool(site.get("ip_login_before_search") and direct_query)
    return {
        "initial_url": str(site.get("home_url") or search_url) if ip_login_before_search else search_url,
        "search_url": search_url,
        "direct_query": direct_query,
        "ip_login_before_search": ip_login_before_search,
    }


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "artifact"


def sha_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def marker_hits(text: str, markers: list[str]) -> list[str]:
    low = text.lower()
    return [marker for marker in markers if marker and marker.lower() in low]


def extract_result_count(text: str) -> int | None:
    compact = re.sub(r"\s+", " ", text)
    for pattern in RESULT_COUNT_PATTERNS:
        match = re.search(pattern, compact, re.I)
        if not match:
            continue
        raw = match.group(1).replace(",", "").replace("，", "")
        try:
            return int(raw)
        except ValueError:
            continue
    return None


def classify_page_state(site: dict[str, Any], title: str, text: str, status_hint: str | None = None) -> dict[str, Any]:
    combined = f"{title}\n{text[:20000]}"
    access_hits = marker_hits(combined, list(site.get("access_markers") or []))
    login_hits = marker_hits(combined, list(site.get("login_markers") or []) + LOGIN_MARKERS)
    stop_hits = marker_hits(combined, list(site.get("stop_markers") or []) + STOP_MARKERS)
    if not title.strip() and len(text.strip()) < 20:
        status = "empty_page_after_navigation"
    elif stop_hits:
        status = "needs_human_or_blocked"
    elif status_hint:
        status = status_hint
    elif access_hits:
        status = "searched_or_reachable"
    elif login_hits:
        status = "login_may_be_required"
    else:
        status = "unknown_page_state"
    return {
        "status": status,
        "access_markers_found": access_hits,
        "login_markers_found": sorted(set(login_hits)),
        "stop_markers_found": sorted(set(stop_hits)),
    }


def infer_status_hint(status_hint: str | None, result_count: int | None, records: list[dict[str, str]]) -> str | None:
    if status_hint:
        return status_hint
    if result_count is not None or records:
        return "searched_or_reachable"
    return None


def filter_anchor_records(records: list[dict[str, str]], site_url: str, site_id: str, limit: int = 40) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    filtered: list[dict[str, str]] = []
    blocked_words = {
        "privacy",
        "cookie",
        "terms",
        "login",
        "sign in",
        "subscribe",
        "help",
        "contact",
        "feedback",
        "skip to main",
        "find a journal",
        "publish with us",
        "track your research",
        "saved research",
        "advanced search",
        "abstract/details",
        "journal finder",
        "language editing",
        "open access publishing",
        "our products",
        "partners and advertisers",
        "accessibility statement",
        "legal notice",
        "honeypot",
        "basic search",
        "publications a-z",
        "journal information",
        "register/sign-in",
        "author resource",
        "copyright",
        "course reader",
        "impact factor",
        "founder",
        "press center",
        "global access",
        "ordering info",
        "pricing",
        "society partnerships",
        "journals a-z",
        "request a trial",
        "librarian resources",
        "shopping cart",
        "access via your institution",
        "skip main navigation",
        "journal authors",
        "book authors",
        "for librarians",
        "save this search",
        "sort by:",
        "publication year",
        "authors/editors",
        "create my research",
        "selected items",
        "recent searches",
        "company website",
        "support center",
    }
    blocked_record_terms = {
        "full text - pdf",
        "full text pdf",
        "download pdf",
        "download full",
        "fulltextpdf",
        "/fulltextpdf/",
        "下载全文",
        "全文下载",
    }
    href_hints = RESULT_HREF_HINTS.get(site_id, [])
    for record in records:
        text = re.sub(r"\s+", " ", record.get("text", "")).strip()
        href = record.get("href", "").strip()
        if not text or len(text) < 12 or len(text) > 260:
            continue
        low = text.lower()
        if any(word in low for word in blocked_words):
            continue
        combined = f"{low} {href.lower()}"
        if any(term in combined for term in blocked_record_terms):
            continue
        if href_hints and not any(hint.lower() in href.lower() for hint in href_hints):
            continue
        key = (text.lower(), href)
        if key in seen:
            continue
        seen.add(key)
        filtered.append({"text": text, "href": href or site_url})
        if len(filtered) >= limit:
            break
    return filtered


def strip_html(value: str) -> str:
    text = re.sub(r"<script\b.*?</script>", " ", value, flags=re.I | re.S)
    text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", html_lib.unescape(text)).strip()
    return re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)


def wanfang_detail_url(raw_id: str) -> str:
    kind, _, item_id = raw_id.strip().partition("_")
    path = {
        "periodical": "periodical",
        "conference": "conference",
        "thesis": "thesis",
        "degree": "thesis",
        "patent": "patent",
        "standard": "standard",
        "nstr": "tech",
        "cstad": "tech",
    }.get(kind, kind or "detail")
    return f"https://d.wanfangdata.com.cn/{path}/{item_id or raw_id}"


def extract_wanfang_spa_records(html: str, visible_text: str, page_url: str, limit: int = 40) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    seen: set[str] = set()
    for id_match in re.finditer(r'class=["\']title-id-hidden["\'][^>]*>\s*([^<\s]+)\s*<', html, flags=re.I):
        raw_id = id_match.group(1).strip()
        before = html[max(0, id_match.start() - 3000) : id_match.start()]
        title_pos = before.rfind('class="title"')
        if title_pos < 0:
            title_pos = before.rfind("class='title'")
        if title_pos < 0:
            continue
        title_fragment = before[title_pos:]
        content_start = title_fragment.find(">")
        if content_start < 0:
            continue
        title_fragment = title_fragment[content_start + 1 :]
        for marker in ("<!----><!----><div", '<div data-v-', '<span class="title-id-hidden"', "<span class='title-id-hidden'"):
            marker_pos = title_fragment.find(marker)
            if marker_pos >= 0:
                title_fragment = title_fragment[:marker_pos]
                break
        title_fragment = re.sub(r"<span\s*$", "", title_fragment, flags=re.I)
        title = strip_html(title_fragment)
        if not title or title in seen:
            continue
        seen.add(title)
        records.append({"text": title, "href": wanfang_detail_url(raw_id)})
        if len(records) >= limit:
            return records

    for line in visible_text.splitlines():
        match = re.match(r"\s*\d{1,3}\.(\S.{6,180})\s*$", line)
        if not match:
            continue
        title = re.sub(r"\s+", " ", match.group(1)).strip()
        if title in seen:
            continue
        seen.add(title)
        records.append({"text": title, "href": page_url})
        if len(records) >= limit:
            break
    return records


def extract_incopat_records(raw_anchors: list[dict[str, str]], limit: int = 40) -> list[dict[str, str]]:
    grouped: dict[str, dict[str, Any]] = {}
    generic_labels = {
        "invention application",
        "invention authority",
        "utility model",
        "under examination",
        "cn patent family",
        "pct international phase expired",
    }
    detail_pattern = re.compile(r"openDetailedInfo\('([^']+)','([^']+)'\)$")
    patent_number_pattern = re.compile(r"^[A-Z]{2}\d+[A-Z]\d?$")
    for anchor in raw_anchors:
        href = str(anchor.get("href") or "").strip()
        match = detail_pattern.search(href)
        if not match:
            continue
        key = match.group(1)
        text = re.sub(r"\s+", " ", str(anchor.get("text") or "")).strip()
        if not text:
            continue
        entry = grouped.setdefault(key, {"href": href, "number": key, "titles": []})
        if patent_number_pattern.match(text):
            entry["number"] = text
            continue
        low = text.lower()
        if low in generic_labels or "patent family" in low:
            continue
        if len(text) >= 20:
            entry["titles"].append(text)

    records: list[dict[str, str]] = []
    for key, entry in grouped.items():
        title = max(entry["titles"], key=len) if entry["titles"] else ""
        number = str(entry["number"])
        label = f"{number} - {title}" if title and title != number else number
        records.append({"text": label, "href": str(entry["href"])})
        if len(records) >= limit:
            break
    return records


def extract_site_records(
    site_id: str,
    raw_anchors: list[dict[str, str]],
    html: str,
    visible_text: str,
    page_url: str,
) -> list[dict[str, str]]:
    if site_id == "wanfang":
        records = extract_wanfang_spa_records(html, visible_text, page_url)
        anchor_records = filter_anchor_records(raw_anchors, page_url, site_id)
        seen = {(record["text"].lower(), record["href"]) for record in records}
        for record in anchor_records:
            key = (record["text"].lower(), record["href"])
            if key not in seen:
                records.append(record)
                seen.add(key)
        return records[:40]
    if site_id == "incopat":
        records = extract_incopat_records(raw_anchors)
        return records or filter_anchor_records(raw_anchors, page_url, site_id)
    return filter_anchor_records(raw_anchors, page_url, site_id)


def filter_export_links(records: list[dict[str, str]], limit: int = 20) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for record in records:
        text = re.sub(r"\s+", " ", record.get("text", "")).strip()
        href = record.get("href", "").strip()
        low = f"{text} {href}".lower()
        if not text or not href or not any(word in low for word in EXPORT_WORDS):
            continue
        key = (text.lower(), href)
        if key in seen:
            continue
        seen.add(key)
        links.append({"text": text, "href": href})
        if len(links) >= limit:
            break
    return links


def selector_score(selector: str) -> int:
    if not selector:
        return 0
    score = 0
    if "#" in selector:
        score += 5
    if "[name=" in selector:
        score += 4
    if "[placeholder=" in selector or "[aria-label=" in selector:
        score += 3
    if ":nth-of-type" in selector:
        score -= 2
    return score


def unique_sorted_selectors(selectors: list[str], limit: int = 12) -> list[str]:
    seen: set[str] = set()
    cleaned = []
    for selector in selectors:
        if not selector or selector in seen:
            continue
        seen.add(selector)
        cleaned.append(selector)
    cleaned.sort(key=lambda item: (-selector_score(item), len(item), item))
    return cleaned[:limit]


def suggest_selectors(site_id: str, elements: list[dict[str, Any]]) -> dict[str, Any]:
    search_terms = [
        "search",
        "query",
        "keyword",
        "keywords",
        "检索",
        "搜索",
        "查询",
        "关键词",
        "题名",
        "主题",
        "专利",
    ]
    ip_terms = [term.lower() for term in IP_ACCESS_TEXTS] + ["校园网登录", "校园网访问"]
    export_terms = [term.lower() for term in EXPORT_WORDS] + ["导出", "下载", "export", "csv", "ris", "excel"]
    result_hints = RESULT_HREF_HINTS.get(site_id, [])

    search_selectors: list[str] = []
    ip_selectors: list[str] = []
    export_selectors: list[str] = []
    result_selectors: list[str] = []

    for element in elements:
        selector = str(element.get("selector") or "")
        href = str(element.get("href") or "")
        hay = " ".join(
            str(element.get(key) or "")
            for key in ("text", "aria_label", "placeholder", "title", "name", "id", "type", "role")
        ).lower()
        tag = str(element.get("tag") or "").lower()
        if tag in {"input", "textarea"} or element.get("contenteditable"):
            if any(term.lower() in hay for term in search_terms) or str(element.get("type") or "").lower() in {"text", "search", ""}:
                search_selectors.append(selector)
        if any(term in hay for term in ip_terms):
            ip_selectors.append(selector)
        if any(term in hay or term in href.lower() for term in export_terms):
            export_selectors.append(selector)
        if tag == "a" and href:
            if result_hints and any(hint.lower() in href.lower() for hint in result_hints):
                result_selectors.append(selector)

    return {
        "site_id": site_id,
        "search_box_selectors": unique_sorted_selectors(search_selectors),
        "ip_login_selectors": unique_sorted_selectors(ip_selectors),
        "export_selectors": unique_sorted_selectors(export_selectors),
        "result_link_selectors": unique_sorted_selectors(result_selectors),
    }


def extract_filter_candidates(elements: list[dict[str, Any]], limit: int = 80) -> list[dict[str, Any]]:
    include_terms = [
        "filter",
        "refine",
        "sort",
        "year",
        "date",
        "publication",
        "document type",
        "content type",
        "article type",
        "subject",
        "discipline",
        "topic",
        "author",
        "affiliation",
        "source",
        "journal",
        "conference",
        "standard",
        "access",
        "export",
        "download",
        "citation",
        "csv",
        "ris",
        "bibtex",
        "筛选",
        "精炼",
        "排序",
        "发表时间",
        "文献类型",
        "主题",
        "学科",
        "作者",
        "机构",
        "来源",
        "期刊",
        "会议",
        "标准",
        "导出",
        "下载",
        "引文",
    ]
    block_terms = ["privacy", "cookie", "terms", "contact", "help", "sign in", "login"]
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for element in elements:
        label = re.sub(
            r"\s+",
            " ",
            " ".join(
                str(element.get(key) or "")
                for key in ("text", "aria_label", "placeholder", "title", "name", "id")
            ),
        ).strip()
        href = str(element.get("href") or "")
        hay = f"{label} {href}".lower()
        if not label or len(label) > 180:
            continue
        if any(term in hay for term in block_terms):
            continue
        if not any(term.lower() in hay for term in include_terms):
            continue
        selector = str(element.get("selector") or "")
        key = selector or label.lower()
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "label": label,
                "selector": selector,
                "tag": element.get("tag"),
                "href": href,
                "visible": element.get("visible"),
            }
        )
        if len(candidates) >= limit:
            break
    return candidates


async def collect_interactive_dom(page: Any, limit: int = 500) -> list[dict[str, Any]]:
    try:
        return await page.evaluate(
            """(limit) => {
                function cssEscape(value) {
                    if (window.CSS && CSS.escape) return CSS.escape(value);
                    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
                }
                function shortText(value) {
                    return String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
                }
                function selectorFor(el) {
                    if (el.id) return `${el.tagName.toLowerCase()}#${cssEscape(el.id)}`;
                    const attrs = ['name', 'aria-label', 'placeholder', 'title', 'type', 'href'];
                    for (const attr of attrs) {
                        const value = el.getAttribute(attr);
                        if (value && value.length < 90) {
                            return `${el.tagName.toLowerCase()}[${attr}="${value.replace(/"/g, '\\"')}"]`;
                        }
                    }
                    const parts = [];
                    let cur = el;
                    while (cur && cur.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
                        let part = cur.tagName.toLowerCase();
                        const parent = cur.parentElement;
                        if (!parent) {
                            parts.unshift(part);
                            break;
                        }
                        const siblings = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
                        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
                        parts.unshift(part);
                        cur = parent;
                    }
                    return parts.join(' > ');
                }
                const nodes = Array.from(document.querySelectorAll(
                    'input, textarea, select, button, a[href], [role], [contenteditable="true"], [tabindex]'
                ));
                return nodes.slice(0, limit).map((el, index) => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return {
                        index,
                        tag: el.tagName.toLowerCase(),
                        selector: selectorFor(el),
                        text: shortText(el.innerText || el.textContent || el.value || ''),
                        aria_label: shortText(el.getAttribute('aria-label')),
                        placeholder: shortText(el.getAttribute('placeholder')),
                        title: shortText(el.getAttribute('title')),
                        role: shortText(el.getAttribute('role')),
                        id: shortText(el.id),
                        name: shortText(el.getAttribute('name')),
                        type: shortText(el.getAttribute('type')),
                        href: el.href || '',
                        contenteditable: el.getAttribute('contenteditable') === 'true',
                        visible: !!(rect.width || rect.height) && style.visibility !== 'hidden' && style.display !== 'none',
                        box: {x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)}
                    };
                });
            }""",
            limit,
        )
    except Exception:
        return []


async def wait_settle(page: Any, timeout_ms: int) -> None:
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass
    try:
        await page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 15000))
    except Exception:
        pass
    await page.wait_for_timeout(1800)


async def fill_first_search_box(page: Any, selectors: list[str], query: str) -> tuple[bool, str | None]:
    tried = []
    for selector in selectors + [s for s in GENERIC_SEARCH_SELECTORS if s not in selectors]:
        tried.append(selector)
        try:
            locator = page.locator(selector)
            count = min(await locator.count(), 8)
        except Exception:
            continue
        for index in range(count):
            candidate = locator.nth(index)
            try:
                if not await candidate.is_visible(timeout=1200):
                    continue
                if not await candidate.is_enabled(timeout=1200):
                    continue
                await candidate.click(timeout=3000)
                try:
                    await candidate.fill("")
                    await candidate.fill(query)
                except Exception:
                    await page.keyboard.press("Control+A")
                    await page.keyboard.type(query)
                await candidate.press("Enter")
                return True, selector
            except Exception:
                continue
    return False, ", ".join(tried)


async def click_text_if_visible(page: Any, text: str, timeout_ms: int = 1800, hover_first: bool = False) -> dict[str, Any]:
    locator = page.get_by_text(text, exact=False).first
    if not await locator.is_visible(timeout=timeout_ms):
        return {"text": text, "status": "not_visible"}
    if hover_first:
        await locator.hover(timeout=4000)
        await page.wait_for_timeout(600)
    await locator.click(timeout=4000)
    await wait_settle(page, 15000)
    return {"text": text, "status": "clicked", "hover_first": hover_first}


async def click_selector_if_visible(page: Any, selector: str, timeout_ms: int = 1200) -> dict[str, Any]:
    locator = page.locator(selector).first
    if not await locator.is_visible(timeout=timeout_ms):
        return {"selector": selector, "status": "not_visible"}
    await locator.click(timeout=4000)
    await wait_settle(page, 15000)
    return {"selector": selector, "status": "clicked"}


async def click_site_specific_ip_login(page: Any, site: dict[str, Any]) -> dict[str, Any] | None:
    site_id = str(site.get("id") or "")
    steps: list[dict[str, Any]] = []
    if site_id == "incopat":
        for login_text in ("登录", "Login", "Sign in"):
            try:
                step = await click_text_if_visible(page, login_text, hover_first=True)
                steps.append({"step": "hover_login_menu", **step})
                if step["status"] == "clicked":
                    break
            except Exception as exc:
                steps.append({"step": "hover_login_menu", "text": login_text, "status": "error", "error": str(exc)})
        for ip_text in ("IP登录", "IP登陆", "IP Login"):
            try:
                step = await click_text_if_visible(page, ip_text, timeout_ms=2500)
                steps.append({"step": "click_ip_login", **step})
                if step["status"] == "clicked":
                    return {"action": "site_specific_ip_login", "site_id": site_id, "status": "clicked", "steps": steps}
            except Exception as exc:
                steps.append({"step": "click_ip_login", "text": ip_text, "status": "error", "error": str(exc)})
        return {"action": "site_specific_ip_login", "site_id": site_id, "status": "not_found", "steps": steps}

    if site_id == "vip":
        for login_text in ("登录", "登陆"):
            try:
                step = await click_text_if_visible(page, login_text)
                steps.append({"step": "click_login", **step})
                if step["status"] == "clicked":
                    break
            except Exception as exc:
                steps.append({"step": "click_login", "text": login_text, "status": "error", "error": str(exc)})
        for ip_text in ("IP登录", "IP登陆", "IP Login"):
            try:
                step = await click_text_if_visible(page, ip_text, timeout_ms=2500)
                steps.append({"step": "click_ip_login", **step})
                if step["status"] == "clicked":
                    break
            except Exception as exc:
                steps.append({"step": "click_ip_login", "text": ip_text, "status": "error", "error": str(exc)})
        icon_selectors = [
            "img[alt*='IP']",
            "img[src*='ip']",
            "[class*='ip'] img",
            "[class*='IP'] img",
            "[class*='login'] img",
            ".layui-layer-content img",
        ]
        for selector in icon_selectors:
            try:
                step = await click_selector_if_visible(page, selector)
                steps.append({"step": "click_ip_icon", **step})
                if step["status"] == "clicked":
                    return {"action": "site_specific_ip_login", "site_id": site_id, "status": "clicked", "steps": steps}
            except Exception as exc:
                steps.append({"step": "click_ip_icon", "selector": selector, "status": "error", "error": str(exc)})
        return {"action": "site_specific_ip_login", "site_id": site_id, "status": "partial_or_not_found", "steps": steps}

    return None


async def click_ip_access_if_present(page: Any, site: dict[str, Any]) -> dict[str, Any]:
    specific = await click_site_specific_ip_login(page, site)
    if specific and specific.get("status") == "clicked":
        return specific
    texts = list(site.get("ip_login_texts") or []) + [t for t in IP_ACCESS_TEXTS if t not in (site.get("ip_login_texts") or [])]
    for text in texts:
        try:
            locator = page.get_by_text(text, exact=False).first
            if not await locator.is_visible(timeout=1200):
                continue
            await locator.click(timeout=4000)
            await wait_settle(page, 20000)
            return {"action": "click_ip_access", "text": text, "status": "clicked"}
        except Exception:
            continue

    selectors = list(site.get("ip_login_selectors") or [])
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if not await locator.is_visible(timeout=1200):
                continue
            await locator.click(timeout=4000)
            await wait_settle(page, 20000)
            return {"action": "click_ip_access", "selector": selector, "status": "clicked"}
        except Exception:
            continue

    try:
        locator = page.locator("a[href], button")
        count = min(await locator.count(), 120)
    except Exception:
        count = 0
    href_terms = ["institution", "shibboleth", "openathens", "wayf", "login", "sso", "access", "checkaccess", "carsi"]
    for index in range(count):
        candidate = locator.nth(index)
        try:
            if not await candidate.is_visible(timeout=800):
                continue
            text = re.sub(r"\s+", " ", await candidate.inner_text(timeout=800)).strip()
        except Exception:
            text = ""
        try:
            href = await candidate.get_attribute("href", timeout=800) or ""
        except Exception:
            href = ""
        hay = f"{text} {href}".lower()
        if not hay.strip():
            continue
        if any(term.lower() in hay for term in texts) or any(term in hay for term in href_terms):
            try:
                await candidate.click(timeout=4000)
                await wait_settle(page, 20000)
                return {"action": "click_ip_access", "text": text, "href": href, "status": "clicked_by_candidate_scan"}
            except Exception:
                continue
    if specific:
        return specific
    return {"action": "click_ip_access", "status": "not_found"}


async def collect_anchors(page: Any) -> list[dict[str, str]]:
    try:
        return await page.evaluate(
            """() => Array.from(document.querySelectorAll('a[href]')).map(a => ({
                text: (a.innerText || a.textContent || '').trim(),
                href: a.href || ''
            }))"""
        )
    except Exception:
        return []


async def run_site(page: Any, site: dict[str, Any], query: str, out_dir: Path, args: argparse.Namespace) -> dict[str, Any]:
    site_id = str(site["id"])
    site_dir = out_dir / safe_name(site_id)
    site_dir.mkdir(parents=True, exist_ok=True)
    actions: list[dict[str, Any]] = []
    started = time.monotonic()
    navigation = build_navigation_plan(site, query)
    url = navigation["initial_url"]
    direct_query = bool(navigation["direct_query"])
    status_hint = None

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=args.timeout_ms)
        actions.append({"action": "goto", "url": url, "direct_query": direct_query})
        await wait_settle(page, args.timeout_ms)
    except Exception as exc:
        status_hint = "navigation_error"
        actions.append({"action": "goto_error", "url": url, "error": str(exc)})

    if navigation["ip_login_before_search"] and status_hint is None:
        if args.try_ip_login:
            ip_action = await click_ip_access_if_present(page, site)
            actions.append(ip_action)
        try:
            await page.goto(navigation["search_url"], wait_until="domcontentloaded", timeout=args.timeout_ms)
            actions.append({"action": "goto_search_after_ip_login", "url": navigation["search_url"]})
            await wait_settle(page, args.timeout_ms)
        except Exception as exc:
            status_hint = "navigation_error"
            actions.append({"action": "goto_search_after_ip_login_error", "url": navigation["search_url"], "error": str(exc)})

    if not direct_query and status_hint is None:
        if args.try_ip_login:
            ip_action = await click_ip_access_if_present(page, site)
            actions.append(ip_action)
        selectors = list(site.get("search_box_selectors") or [])
        filled, selector_info = await fill_first_search_box(page, selectors, query)
        if filled:
            actions.append({"action": "fill_search", "selector": selector_info})
            await wait_settle(page, args.timeout_ms)
        else:
            actions.append({"action": "search_box_not_found", "selectors_tried": selector_info})
            if args.manual_wait_seconds > 0:
                actions.append({"action": "manual_wait", "seconds": args.manual_wait_seconds})
                await page.wait_for_timeout(args.manual_wait_seconds * 1000)
                filled, selector_info = await fill_first_search_box(page, selectors, query)
                if filled:
                    actions.append({"action": "fill_search_after_manual_wait", "selector": selector_info})
                    await wait_settle(page, args.timeout_ms)
                else:
                    status_hint = "blocked_no_search_box"
            else:
                status_hint = "blocked_no_search_box"

    try:
        title = await page.title()
    except Exception:
        title = ""
    try:
        visible_text = await page.locator("body").inner_text(timeout=5000)
    except Exception:
        visible_text = ""
    try:
        html = await page.content()
    except Exception:
        html = ""
    title = redact_private_text(title)
    visible_text = redact_private_text(visible_text)
    html = redact_private_text(html)

    digest = sha_text(html or visible_text or page.url)
    html_path = site_dir / f"{safe_name(site_id)}_{digest[:12]}.html"
    text_path = site_dir / f"{safe_name(site_id)}_{digest[:12]}.txt"
    screenshot_path: Path | None = site_dir / f"{safe_name(site_id)}_{digest[:12]}.png"
    html_path.write_text(html, encoding="utf-8", errors="replace")
    text_path.write_text(visible_text, encoding="utf-8", errors="replace")
    try:
        await page.screenshot(path=str(screenshot_path), full_page=True)
    except Exception as exc:
        actions.append({"action": "screenshot_error", "error": str(exc)})
        screenshot_path = None

    raw_anchors = await collect_anchors(page)
    anchors = extract_site_records(site_id, raw_anchors, html, visible_text, page.url)
    export_links = filter_export_links(raw_anchors)
    interactive_elements = await collect_interactive_dom(page, getattr(args, "element_limit", 500))
    filter_candidates = extract_filter_candidates(interactive_elements)
    selector_suggestions = suggest_selectors(site_id, interactive_elements)
    result_count = extract_result_count(visible_text)
    status_hint = infer_status_hint(status_hint, result_count, anchors)
    state = classify_page_state(site, title, visible_text, status_hint)
    evidence = {
        "generated_at": now_stamp(),
        "site_id": site_id,
        "site_name": site.get("name"),
        "site_type": site.get("type"),
        "query": query,
        "title": title,
        "url": page.url,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "result_count": result_count,
        "state": state,
        "actions": actions,
        "artifacts": {
            "html": str(html_path),
            "text": str(text_path),
            "screenshot": str(screenshot_path) if screenshot_path else None,
        },
        "records": anchors,
        "export_links": export_links,
        "filter_candidates": filter_candidates,
        "selector_suggestions": selector_suggestions,
    }
    evidence = redact_json_value(evidence)
    evidence_path = site_dir / f"{safe_name(site_id)}_evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    evidence["evidence_path"] = str(evidence_path)
    return evidence


def write_site_error_evidence(
    site: dict[str, Any],
    query: str,
    out_dir: Path,
    exc: BaseException,
    actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    site_id = str(site["id"])
    site_dir = out_dir / safe_name(site_id)
    site_dir.mkdir(parents=True, exist_ok=True)
    evidence = {
        "generated_at": now_stamp(),
        "site_id": site_id,
        "site_name": site.get("name"),
        "site_type": site.get("type"),
        "query": query,
        "title": "",
        "url": site.get("home_url"),
        "elapsed_ms": 0,
        "result_count": None,
        "state": {
            "status": "site_run_error",
            "access_markers_found": [],
            "login_markers_found": [],
            "stop_markers_found": [],
            "error": str(exc),
        },
        "actions": (actions or []) + [{"action": "site_run_error", "error": str(exc)}],
        "artifacts": {
            "html": None,
            "text": None,
            "screenshot": None,
        },
        "records": [],
        "export_links": [],
    }
    evidence = redact_json_value(evidence)
    evidence_path = site_dir / f"{safe_name(site_id)}_evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    evidence["evidence_path"] = str(evidence_path)
    return evidence


async def run_browser(args: argparse.Namespace) -> int:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit(f"Playwright is not installed: {exc}") from exc

    registry = load_json(Path(args.registry))
    plan = load_json(Path(args.plan)) if args.plan else {}
    query = args.query or plan_query(plan)
    if not query:
        raise SystemExit("A query is required. Pass --query or a plan with keywords/query.")
    sites = split_list(args.sites) or list(plan.get("sites") or []) or default_sites(str(plan.get("mode") or "combined"))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        cdp_endpoint = cdp_endpoint_from_args(args)
        results = []
        if cdp_endpoint:
            launched_proc = launch_cdp_browser_process(args, profile_dir) if args.launch_cdp else None
            browser = await p.chromium.connect_over_cdp(cdp_endpoint, timeout=args.timeout_ms)
            try:
                context = browser.contexts[0] if browser.contexts else await browser.new_context()
                for site_id in sites:
                    site = find_site(registry, site_id)
                    page = None
                    try:
                        page = await context.new_page()
                        results.append(await run_site(page, site, query, out_dir, args))
                    except Exception as exc:
                        results.append(write_site_error_evidence(site, query, out_dir, exc, [{"action": "cdp_run_site", "endpoint": cdp_endpoint}]))
                    finally:
                        if page is not None:
                            try:
                                await page.close()
                            except Exception:
                                pass
            finally:
                if args.close_launched_cdp and launched_proc is not None:
                    launched_proc.terminate()
        else:
            launch_kwargs: dict[str, Any] = {
                "headless": bool(args.headless),
                "accept_downloads": True,
                "viewport": {"width": args.width, "height": args.height},
                "locale": args.locale,
            }
            if args.channel:
                launch_kwargs["channel"] = args.channel
            for site_id in sites:
                site = find_site(registry, site_id)
                context = None
                page = None
                try:
                    site_profile_dir = profile_dir / safe_name(site_id)
                    site_profile_dir.mkdir(parents=True, exist_ok=True)
                    context = await p.chromium.launch_persistent_context(str(site_profile_dir), **launch_kwargs)
                    page = await context.new_page()
                    results.append(await run_site(page, site, query, out_dir, args))
                except Exception as exc:
                    results.append(write_site_error_evidence(site, query, out_dir, exc, [{"action": "launch_or_run_site"}]))
                finally:
                    if page is not None:
                        try:
                            await page.close()
                        except Exception:
                            pass
                    if context is not None:
                        try:
                            await context.close()
                        except Exception:
                            pass

    run_report = {
        "generated_at": now_stamp(),
        "plan": str(Path(args.plan).resolve()) if args.plan else None,
        "query": query,
        "profile_dir": str(profile_dir.resolve()),
        "cdp_endpoint": cdp_endpoint,
        "results": results,
    }
    report_path = out_dir / "browser_research_run.json"
    report_path.write_text(json.dumps(run_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(run_report, indent=2, ensure_ascii=False))
    return 0


async def snapshot_one_site(context: Any, registry: dict[str, Any], args: argparse.Namespace, site_id: str) -> dict[str, Any]:
    site = find_site(registry, site_id)
    out_dir = Path(args.out_dir) / safe_name(site_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    actions: list[dict[str, Any]] = []
    direct_query = False
    if args.url:
        url = args.url
    elif args.query:
        url, direct_query = build_search_url(site, args.query)
    else:
        url = str(site.get("home_url"))
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=args.timeout_ms)
        actions.append({"action": "goto", "url": url, "direct_query": direct_query})
        await wait_settle(page, args.timeout_ms)
        if args.try_ip_login:
            actions.append(await click_ip_access_if_present(page, site))
        if args.query and not direct_query:
            selectors = list(site.get("search_box_selectors") or [])
            filled, selector_info = await fill_first_search_box(page, selectors, args.query)
            actions.append({"action": "optional_query", "filled": filled, "selector_info": selector_info, "query": args.query})
            if filled:
                await wait_settle(page, args.timeout_ms)
        if args.manual_wait_seconds > 0:
            actions.append({"action": "manual_wait_before_snapshot", "seconds": args.manual_wait_seconds})
            await page.wait_for_timeout(args.manual_wait_seconds * 1000)

        title = await page.title()
        visible_text = await page.locator("body").inner_text(timeout=5000)
        html = await page.content()
        interactive_elements = await collect_interactive_dom(page, args.element_limit)
        suggestions = suggest_selectors(site_id, interactive_elements)
        digest = sha_text(html or visible_text or page.url)
        stem = f"{safe_name(site_id)}_dom_{digest[:12]}"
        html_path = out_dir / f"{stem}.html"
        text_path = out_dir / f"{stem}.txt"
        screenshot_path = out_dir / f"{stem}.png"
        snapshot_path = out_dir / f"{stem}.json"
        html_path.write_text(html, encoding="utf-8", errors="replace")
        text_path.write_text(visible_text, encoding="utf-8", errors="replace")
        try:
            await page.screenshot(path=str(screenshot_path), full_page=True)
        except Exception as exc:
            actions.append({"action": "screenshot_error", "error": str(exc)})
            screenshot_path = Path("")
        snapshot = {
            "generated_at": now_stamp(),
            "site_id": site_id,
            "site_name": site.get("name"),
            "url": page.url,
            "title": title,
            "state": classify_page_state(site, title, visible_text),
            "actions": actions,
            "artifacts": {
                "html": str(html_path),
                "text": str(text_path),
                "screenshot": str(screenshot_path) if screenshot_path else None,
            },
            "selector_suggestions": suggestions,
            "interactive_elements": interactive_elements,
            "registry_update_hint": {
                "site_id": site_id,
                "fields_to_review": [
                    "search_box_selectors",
                    "ip_login_selectors",
                    "export_selectors",
                    "result_link_selectors",
                ],
                "suggested_values": suggestions,
            },
        }
        snapshot_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return {"site_id": site_id, "snapshot": str(snapshot_path), "suggestions": suggestions, "state": snapshot["state"]}
    finally:
        await page.close()


async def dom_snapshot(args: argparse.Namespace) -> int:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit(f"Playwright is not installed: {exc}") from exc

    registry = load_json(Path(args.registry))
    requested_sites = split_list(args.sites) if args.sites else [args.site]
    if not requested_sites or not requested_sites[0]:
        raise SystemExit("Pass --site or --sites.")
    if requested_sites == ["all"]:
        requested_sites = [str(site["id"]) for site in registry.get("sites", [])]
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        cdp_endpoint = cdp_endpoint_from_args(args)
        results = []
        if cdp_endpoint:
            launched_proc = launch_cdp_browser_process(args, profile_dir) if args.launch_cdp else None
            browser = await p.chromium.connect_over_cdp(cdp_endpoint, timeout=args.timeout_ms)
            try:
                context = browser.contexts[0] if browser.contexts else await browser.new_context()
                for site_id in requested_sites:
                    try:
                        results.append(await snapshot_one_site(context, registry, args, site_id))
                    except Exception as exc:
                        site = find_site(registry, site_id)
                        results.append(write_site_error_evidence(site, args.query or "", Path(args.out_dir), exc, [{"action": "cdp_dom_snapshot", "endpoint": cdp_endpoint}]))
            finally:
                if args.close_launched_cdp and launched_proc is not None:
                    launched_proc.terminate()
        else:
            launch_kwargs: dict[str, Any] = {
                "headless": bool(args.headless),
                "accept_downloads": True,
                "viewport": {"width": args.width, "height": args.height},
                "locale": args.locale,
            }
            if args.channel:
                launch_kwargs["channel"] = args.channel
            context = await p.chromium.launch_persistent_context(str(profile_dir), **launch_kwargs)
            try:
                for site_id in requested_sites:
                    results.append(await snapshot_one_site(context, registry, args, site_id))
            finally:
                await context.close()

    summary = {"status": "written", "cdp_endpoint": cdp_endpoint, "sites": results}
    summary_path = Path(args.out_dir) / "dom_snapshot_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def load_evidence_files(evidence_dir: Path) -> list[dict[str, Any]]:
    files = sorted(evidence_dir.glob("*/**/*_evidence.json"))
    if not files:
        files = sorted(evidence_dir.glob("*_evidence.json"))
    records = []
    for path in files:
        try:
            item = load_json(path)
            item["evidence_path"] = str(path)
            records.append(item)
        except Exception:
            continue
    return records


def markdown_table_row(values: list[Any]) -> str:
    return "| " + " | ".join(str(v or "").replace("|", "\\|").replace("\n", " ") for v in values) + " |"


def synthesize_markdown(evidence: list[dict[str, Any]], plan: dict[str, Any] | None, mode: str) -> str:
    query = plan_query(plan or {}) if plan else ""
    if not query and evidence:
        query = str(evidence[0].get("query") or "")
    topic = (plan or {}).get("topic") or query or "research topic"
    lines = [
        f"# Literature and Novelty Evidence Draft",
        "",
        f"Generated: {now_stamp()}",
        f"Topic: {topic}",
        f"Mode: {mode}",
        f"Query: {query}",
        "",
        "## Search Evidence",
        "",
        "| Database | Status | Result Count | URL | Evidence |",
        "|---|---|---:|---|---|",
    ]
    for item in evidence:
        state = item.get("state") or {}
        lines.append(
            markdown_table_row(
                [
                    item.get("site_name") or item.get("site_id"),
                    state.get("status"),
                    item.get("result_count") if item.get("result_count") is not None else "",
                    item.get("url"),
                    item.get("evidence_path"),
                ]
            )
        )

    lines += [
        "",
        "## Candidate Literature / Patent Records",
        "",
        "| Database | Candidate | Link |",
        "|---|---|---|",
    ]
    for item in evidence:
        for record in (item.get("records") or [])[:10]:
            lines.append(markdown_table_row([item.get("site_name") or item.get("site_id"), record.get("text"), record.get("href")]))

    lines += [
        "",
        "## Export Links Found",
        "",
        "| Database | Export Link | URL |",
        "|---|---|---|",
    ]
    for item in evidence:
        for link in item.get("export_links") or []:
            lines.append(markdown_table_row([item.get("site_name") or item.get("site_id"), link.get("text"), link.get("href")]))

    lit_sites = [item for item in evidence if item.get("site_type") == "literature"]
    patent_sites = [item for item in evidence if item.get("site_type") == "patent"]
    if lit_sites:
        lines += [
            "",
            "## Literature Review Draft",
            "",
            "The browser run collected searchable evidence from these literature databases: "
            + ", ".join(item.get("site_name") or item.get("site_id") for item in lit_sites)
            + ". Use the candidate-record table above as the first screening set, then prioritize records that appear across citation indexes, engineering indexes, and full-text publisher platforms.",
            "",
            "Initial synthesis points:",
        ]
        for item in lit_sites:
            count = item.get("result_count")
            count_text = f"reported about {count} results" if count is not None else "did not expose a parseable result count"
            lines.append(f"- {item.get('site_name') or item.get('site_id')}: {count_text}; review the saved screenshot/text evidence before citing.")
    if patent_sites:
        lines += [
            "",
            "## Technology Novelty Draft",
            "",
            "Patent novelty work should compare claim/abstract overlap, priority dates, applicants, legal status, family grouping, and IPC/CPC classes. The browser run collected patent-search evidence from: "
            + ", ".join(item.get("site_name") or item.get("site_id") for item in patent_sites)
            + ".",
            "",
            "Closest-document screening queue:",
        ]
        for item in patent_sites:
            for record in (item.get("records") or [])[:5]:
                lines.append(f"- {item.get('site_name') or item.get('site_id')}: {record.get('text')} ({record.get('href')})")

    lines += [
        "",
        "## Caveats",
        "",
        "- This draft is evidence-first: verify each candidate inside the source database before final claims.",
        "- If a site reports login, CAPTCHA, abnormal-download, or access-denied markers, stop automation and use an authorized manual session or official export.",
        "- Do not treat generic navigation links as citations; keep only records confirmed from a result list or database export.",
    ]
    return "\n".join(lines) + "\n"


def cmd_synthesize(args: argparse.Namespace) -> int:
    evidence = load_evidence_files(Path(args.evidence_dir))
    plan = load_json(Path(args.plan)) if args.plan else None
    text = synthesize_markdown(evidence, plan, args.mode)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(json.dumps({"status": "written", "out": str(out), "evidence_files": len(evidence)}, ensure_ascii=False, indent=2))
    return 0


def cmd_cdp_session(args: argparse.Namespace) -> int:
    profile_dir = Path(args.profile_dir)
    endpoint = f"http://127.0.0.1:{int(args.cdp_port)}"
    proc = launch_cdp_browser_process(args, profile_dir)
    status = "already_running" if proc is None else "started"
    opened = open_urls_in_cdp(endpoint, list(args.open_url or [])) if args.open_url else []
    result = {
        "status": status,
        "cdp_endpoint": endpoint,
        "profile_dir": str(profile_dir.resolve()),
        "open_urls": list(args.open_url or []),
        "opened": opened,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def add_cdp_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--cdp-endpoint", help="Connect to a dedicated existing Chrome/Edge CDP endpoint, for example http://127.0.0.1:9333.")
    parser.add_argument("--launch-cdp", action="store_true", help="Start a real headed Chrome/Edge CDP browser on --cdp-port and connect to it.")
    parser.add_argument("--cdp-port", type=int, default=DEFAULT_CDP_PORT, help="Dedicated CDP port used with --launch-cdp. Do not use 9222 when another workflow owns it.")
    parser.add_argument("--browser-executable", help="Optional path to chrome.exe or msedge.exe for --launch-cdp.")
    parser.add_argument("--close-launched-cdp", action="store_true", help="Close the browser process started by --launch-cdp after the run. Default keeps it open to preserve session state.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run browser-based literature review and patent novelty evidence collection.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run")
    run.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    run.add_argument("--plan")
    run.add_argument("--query")
    run.add_argument("--sites", help="Comma/semicolon/newline separated site ids. Defaults from plan mode.")
    run.add_argument("--out-dir", required=True)
    run.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    run.add_argument("--channel", help="Optional browser channel such as chrome, msedge, or chromium.")
    run.add_argument("--headless", action="store_true", help="Run without a visible browser window.")
    run.add_argument("--try-ip-login", dest="try_ip_login", action="store_true", default=True, help="Try visible IP/institutional access buttons before searching.")
    run.add_argument("--no-ip-login", dest="try_ip_login", action="store_false", help="Do not click IP/institutional access buttons.")
    run.add_argument("--manual-wait-seconds", type=int, default=0, help="Wait for authorized manual login if a search box is unavailable.")
    run.add_argument("--timeout-ms", type=int, default=45000)
    run.add_argument("--width", type=int, default=1440)
    run.add_argument("--height", type=int, default=1000)
    run.add_argument("--locale", default="zh-CN")
    run.add_argument("--element-limit", type=int, default=500, help="Interactive DOM elements to inspect for filters/export controls.")
    add_cdp_arguments(run)
    run.set_defaults(func=lambda args: __import__("asyncio").run(run_browser(args)))

    dom = sub.add_parser("dom-snapshot")
    dom.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    dom.add_argument("--site", help="One site id.")
    dom.add_argument("--sites", help="Comma/semicolon/newline separated site ids, or 'all' for a routine DOM refresh.")
    dom.add_argument("--url")
    dom.add_argument("--query", help="Optional smoke query to move from the landing page to the result page before taking DOM.")
    dom.add_argument("--out-dir", required=True)
    dom.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    dom.add_argument("--channel", help="Optional browser channel such as chrome, msedge, or chromium.")
    dom.add_argument("--headless", action="store_true", help="Only for public smoke checks; paid databases should stay visible.")
    dom.add_argument("--try-ip-login", dest="try_ip_login", action="store_true", default=True, help="Try visible IP/institutional access buttons before snapshot.")
    dom.add_argument("--no-ip-login", dest="try_ip_login", action="store_false", help="Do not click IP/institutional access buttons.")
    dom.add_argument("--manual-wait-seconds", type=int, default=0, help="Allow manual checkpoint before DOM capture.")
    dom.add_argument("--timeout-ms", type=int, default=45000)
    dom.add_argument("--width", type=int, default=1440)
    dom.add_argument("--height", type=int, default=1000)
    dom.add_argument("--locale", default="zh-CN")
    dom.add_argument("--element-limit", type=int, default=500)
    add_cdp_arguments(dom)
    dom.set_defaults(func=lambda args: __import__("asyncio").run(dom_snapshot(args)))

    cdp = sub.add_parser("cdp-session", help="Start a dedicated real Chrome/Edge CDP browser for paid database login/session reuse.")
    cdp.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    cdp.add_argument("--channel", help="Optional browser channel preference such as chrome or msedge.")
    cdp.add_argument("--headless", action="store_true", help="Only for public smoke checks; paid database login should stay visible.")
    cdp.add_argument("--cdp-port", type=int, default=DEFAULT_CDP_PORT, help="Dedicated CDP port. Avoid 9222 when another workflow owns it.")
    cdp.add_argument("--browser-executable", help="Optional path to chrome.exe or msedge.exe.")
    cdp.add_argument("--timeout-ms", type=int, default=45000)
    cdp.add_argument(
        "--open-url",
        action="append",
        default=[],
        help="URL to open at startup. Repeat for Chrome account, CNKI, IncoPat, or library landing pages.",
    )
    cdp.set_defaults(func=cmd_cdp_session)

    synth = sub.add_parser("synthesize")
    synth.add_argument("--evidence-dir", required=True)
    synth.add_argument("--plan")
    synth.add_argument("--mode", choices=["literature", "patent", "combined"], default="combined")
    synth.add_argument("--out", required=True)
    synth.set_defaults(func=cmd_synthesize)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
