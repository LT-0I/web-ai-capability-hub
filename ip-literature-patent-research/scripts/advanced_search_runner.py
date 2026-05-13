from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from browser_research_runner import (  # noqa: E402
    DEFAULT_CDP_PORT,
    DEFAULT_PROFILE,
    DEFAULT_REGISTRY,
    add_cdp_arguments,
    cdp_endpoint_from_args,
    classify_page_state,
    click_ip_access_if_present,
    click_selector_if_visible,
    collect_anchors,
    collect_interactive_dom,
    extract_filter_candidates,
    extract_result_count,
    extract_site_records,
    find_site,
    infer_status_hint,
    launch_cdp_browser_process,
    load_json,
    now_stamp,
    redact_json_value,
    redact_private_text,
    safe_name,
    sha_text,
    split_list,
    suggest_selectors,
    wait_settle,
    write_site_error_evidence,
)


DEFAULT_ADVANCED_SITES = ["cnki", "wanfang", "vip", "incopat"]

FULLTEXT_DOWNLOAD_TERMS = [
    "full text",
    "pdf",
    "caj",
    "download full",
    "\u4e0b\u8f7d",
    "\u5168\u6587",
    "\u6279\u91cf\u4e0b\u8f7d",
    "\u514d\u8d39\u4e0b\u8f7d",
    "\u5728\u7ebf\u9605\u8bfb",
    "html\u9605\u8bfb",
]

METADATA_FORMAT_TERMS = [
    "bibtex",
    "ris",
    "endnote",
    "refworks",
    "csv",
    "excel",
    "metadata",
    "\u9898\u5f55",
    "\u81ea\u5b9a\u4e49\u5b57\u6bb5",
]

CITATION_TERMS = [
    "citation",
    "cite",
    "\u5f15\u7528",
    "\u6279\u91cf\u5f15\u7528",
]

EXPORT_TERMS = [
    "export",
    "\u5bfc\u51fa",
    "\u5bfc\u51fa\u6587\u732e",
    "\u67e5\u65b0\u683c\u5f0f\u5bfc\u51fa",
]

ANALYSIS_TERMS = [
    "analysis",
    "analyze",
    "\u5206\u6790",
    "\u5bfc\u51fa\u4e0e\u5206\u6790",
    "topic words",
    "\u4e3b\u9898\u8bcd",
]

SEARCH_BUTTON_LABELS = [
    "\u68c0\u7d22",
    "\u641c\u7d22",
    "Search",
    "search",
    "\u5f00\u59cb\u68c0\u7d22",
]

INCO_PAT_LOGIN_URLS = [
    "https://www.incopat.com/newLogin",
    "https://www.incopat.com/login",
]

FORM_INPUT_DENY_TERMS = [
    "password",
    "captcha",
    "verify",
    "login",
    "user",
    "mail",
    "phone",
    "mobile",
    "\u624b\u673a",
    "\u9a8c\u8bc1\u7801",
    "\u5bc6\u7801",
    "\u7528\u6237\u540d",
    "\u673a\u6784\u540d",
    "\u8d26\u53f7",
]


def normalized_label(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def classify_export_control(
    label: str | None,
    href: str | None = None,
    *,
    allow_fulltext_download: bool = False,
) -> dict[str, Any]:
    hay = normalized_label(f"{label or ''} {href or ''}")
    metadata_hit = any(term.lower() in hay for term in METADATA_FORMAT_TERMS)
    fulltext_hit = any(term.lower() in hay for term in FULLTEXT_DOWNLOAD_TERMS)
    if fulltext_hit and not allow_fulltext_download:
        return {
            "label": label or "",
            "href": href or "",
            "safe": False,
            "kind": "blocked_fulltext_download",
            "reason": "full-text or bulk-download control is disabled by default",
        }
    if any(term.lower() in hay for term in ANALYSIS_TERMS):
        return {"label": label or "", "href": href or "", "safe": True, "kind": "analysis_export"}
    if any(term.lower() in hay for term in CITATION_TERMS):
        return {"label": label or "", "href": href or "", "safe": True, "kind": "citation_export"}
    if metadata_hit or any(term.lower() in hay for term in EXPORT_TERMS):
        return {"label": label or "", "href": href or "", "safe": True, "kind": "metadata_export"}
    return {
        "label": label or "",
        "href": href or "",
        "safe": False,
        "kind": "unknown_or_unclassified",
        "reason": "not recognized as a citation, metadata, or analysis export",
    }


def split_query_terms(query: str) -> list[str]:
    terms = [item.strip() for item in re.split(r"[;,|\n]+", query) if item.strip()]
    if terms:
        return terms
    words = [word for word in query.split() if word]
    if len(words) <= 3:
        return [query.strip()] if query.strip() else []
    return [query.strip(), " ".join(words[:3]), " ".join(words[-3:])]


def pick_advanced_fields(site: dict[str, Any], strategy: str) -> list[str]:
    fields = list(site.get("advanced_search_fields") or [])
    if not fields:
        return ["ALL", "Title/Keyword", "Abstract"]
    site_id = str(site.get("id") or "")
    if site_id == "incopat":
        preferred = {
            "recall": ["ALL", "Applicant", "Inventor"],
            "precision": ["ALL", "IPC", "Applicant", "Publication Number"],
            "novelty": ["ALL", "IPC", "Legal Status", "Publication Date"],
            "balanced": ["ALL", "IPC", "Applicant"],
        }.get(strategy, ["ALL", "IPC", "Applicant"])
        picked = [field for field in preferred if field in fields]
        return picked or fields[:3]
    index_map = {
        "cnki": {
            "recall": [0, 4, 10],
            "precision": [3, 2, 10],
            "novelty": [0, 3, 10],
            "balanced": [0, 2, 10],
        },
        "wanfang": {
            "recall": [0, 6, 5],
            "precision": [1, 2, 6],
            "novelty": [1, 6, 5],
            "balanced": [0, 1, 6],
        },
        "vip": {
            "recall": [0, 1, 5],
            "precision": [3, 4, 5],
            "novelty": [1, 3, 5],
            "balanced": [0, 1, 5],
        },
    }
    indices = index_map.get(site_id, {}).get(strategy, [0, 1, 2])
    picked = [fields[index] for index in indices if index < len(fields)]
    return picked or fields[:3]


def build_query_rows(site: dict[str, Any], query: str, strategy: str) -> list[dict[str, Any]]:
    fields = pick_advanced_fields(site, strategy)
    terms = split_query_terms(query) or [query]
    rows: list[dict[str, Any]] = []
    for index, field in enumerate(fields[:3]):
        rows.append(
            {
                "field": field,
                "operator": "" if index == 0 else ("OR" if strategy == "recall" else "AND"),
                "value": terms[index] if index < len(terms) else terms[0],
                "match": "fuzzy" if strategy == "recall" else "exact_or_site_default",
            }
        )
    return rows


def build_filter_rounds(filters: list[str] | None, max_filter_rounds: int) -> list[dict[str, Any]]:
    rounds = []
    for index, label in enumerate((filters or [])[: max(0, max_filter_rounds)], start=1):
        rounds.append({"kind": "result_filter", "round_index": index, "label": label})
    return rounds


def build_export_plan(
    site: dict[str, Any],
    export_mode: str,
    allow_fulltext_download: bool,
) -> dict[str, Any]:
    candidates = []
    blocked = []
    for label in site.get("export_or_analysis_tools") or []:
        item = classify_export_control(label, allow_fulltext_download=allow_fulltext_download)
        if item["safe"]:
            candidates.append(item)
        else:
            blocked.append(item)
    preferred_kind = {
        "citation": "citation_export",
        "analysis": "analysis_export",
        "metadata": "metadata_export",
    }.get(export_mode)
    if preferred_kind:
        candidates.sort(key=lambda item: (item["kind"] != preferred_kind, item["kind"], item["label"]))
    return {
        "mode": export_mode,
        "click_export": False,
        "allow_fulltext_download": allow_fulltext_download,
        "safe_candidates": candidates,
        "blocked_candidates": blocked,
    }


def build_advanced_site_plan(
    site: dict[str, Any],
    query: str,
    *,
    strategy: str = "balanced",
    filters: list[str] | None = None,
    export_mode: str = "metadata",
    max_filter_rounds: int = 3,
    allow_fulltext_download: bool = False,
) -> dict[str, Any]:
    advanced_url = str(site.get("advanced_search_url") or site.get("home_url") or "")
    query_rows = build_query_rows(site, query, strategy)
    return {
        "site_id": site.get("id"),
        "site_name": site.get("name"),
        "site_type": site.get("type"),
        "query": query,
        "strategy": strategy,
        "advanced_search_url": advanced_url,
        "rounds": [
            {
                "kind": "advanced_form",
                "round_index": 0,
                "target_url": advanced_url,
                "query_rows": query_rows,
                "resource_scopes": list(site.get("advanced_resource_scopes") or []),
                "sort_options": list(site.get("sort_options") or []),
                "merge_options": list(site.get("merge_options") or []),
            }
        ]
        + build_filter_rounds(filters, max_filter_rounds),
        "export": build_export_plan(site, export_mode, allow_fulltext_download),
    }


def requires_manual_checkpoint(site_id: str, url: str, title: str, text: str) -> bool:
    hay = normalized_label(f"{url} {title} {text}")
    if any(
        term in hay
        for term in (
            "captcha",
            "access denied",
            "forbidden",
            "\u9a8c\u8bc1\u7801",
            "\u5b89\u5168\u9a8c\u8bc1",
            "\u62d6\u52a8\u4e0b\u65b9\u62fc\u56fe",
            "\u62fc\u56fe\u5b8c\u6210\u9a8c\u8bc1",
        )
    ):
        return True
    if site_id != "incopat":
        return False
    if "searchvalue" in hay and ("simple search" in hay or "advanced search" in hay):
        return False
    if "newlogin" in hay or " login" in hay or "public marketing" in hay:
        return True
    if "advancedsearch" in hay and "searchvalue" not in hay and "patent search" not in hay:
        return True
    return False


def search_button_candidates(site_id: str) -> list[str]:
    candidates: list[str] = []
    if site_id == "cnki":
        candidates.extend(
            [
                'input[title="\u68c0\u7d22"]',
                'input[type="button"][value="\u68c0\u7d22"]',
                'input[type="submit"][value="\u68c0\u7d22"]',
            ]
        )
    if site_id == "wanfang":
        candidates.extend(
            [
                ".submit .submit-btn",
                ".submit-btn",
                'span:has-text("\u68c0\u7d22")',
                'button:has-text("\u68c0\u7d22")',
                'button:has-text("\u641c\u7d22")',
                'input[type="button"][value="\u68c0\u7d22"]',
            ]
        )
    if site_id == "vip":
        candidates.extend(
            [
                'button:has-text("\u68c0\u7d22")',
                'a:has-text("\u68c0\u7d22")',
                'input[type="button"][value="\u68c0\u7d22"]',
            ]
        )
    if site_id == "incopat":
        candidates.extend(
            [
                'button:has-text("Search")',
                'button:has-text("\u68c0\u7d22")',
                'input[type="button"][value="Search"]',
            ]
        )
    candidates.extend(
        [
            'button:has-text("\u68c0\u7d22")',
            'button:has-text("\u641c\u7d22")',
            'input[type="submit"]',
            'input[type="button"][value="\u68c0\u7d22"]',
            'button:has-text("Search")',
        ]
    )
    unique: list[str] = []
    for selector in candidates:
        if selector not in unique:
            unique.append(selector)
    return unique


def is_blocked_form_input_descriptor(value: str | None) -> bool:
    hay = normalized_label(value)
    return any(term.lower() in hay for term in FORM_INPUT_DENY_TERMS)


def should_click_ip_access_on_advanced(site: dict[str, Any], *, prelogin_done: bool = False) -> bool:
    if prelogin_done:
        return False
    site_id = str(site.get("id") or "")
    if site_id in {"cnki", "wanfang", "vip", "incopat"}:
        return False
    return bool(site.get("ip_login_selectors") or site.get("ip_login_texts"))


def should_use_generic_advanced_form(site: dict[str, Any]) -> bool:
    return str(site.get("id") or "") != "incopat"


def should_mark_manual_checkpoint(
    site_id: str,
    url: str,
    title: str,
    text: str,
    records: list[dict[str, Any]] | None = None,
) -> bool:
    if records:
        return False
    return requires_manual_checkpoint(site_id, url, title, text)


def should_wait_after_checkpoint(
    checkpoint_detected: bool,
    manual_wait_seconds: int,
    records: list[dict[str, Any]] | None = None,
) -> bool:
    return bool(checkpoint_detected and manual_wait_seconds > 0 and not records)


def extract_advanced_result_count(text: str) -> int | None:
    base = extract_result_count(text)
    if base is not None:
        return base
    compact = re.sub(r"\s+", "", text or "")
    patterns = [
        r"Total([\d,]+)Records",
        r"Total([\d,]+)Patent",
        r"([\d,]+)Records",
        r"共([\d,，]+)条",
    ]
    for pattern in patterns:
        match = re.search(pattern, compact, re.I)
        if match:
            digits = re.sub(r"[^\d]", "", match.group(1))
            if digits:
                return int(digits)
    return None


def empty_site_evidence(
    site: dict[str, Any],
    plan: dict[str, Any],
    *,
    status: str,
    reason: str,
    actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    evidence = {
        "generated_at": now_stamp(),
        "source_site_id": site.get("id"),
        "site_id": site.get("id"),
        "site_name": site.get("name"),
        "site_type": site.get("type"),
        "query": plan.get("query"),
        "advanced_plan": plan,
        "title": "",
        "url": plan.get("advanced_search_url"),
        "elapsed_ms": 0,
        "result_count": None,
        "state": {"status": status, "reason": reason, "access_markers_found": [], "login_markers_found": [], "stop_markers_found": []},
        "actions": actions or [],
        "artifacts": {"html": None, "text": None, "screenshot": None, "interactive_dom": None},
        "records": [],
        "export_links": [],
        "official_export_candidates": plan.get("export", {}),
        "filter_candidates": [],
        "selector_suggestions": {},
    }
    return redact_json_value(evidence)


def flatten_advanced_records(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in evidence:
        common = {
            "source_site_id": item.get("source_site_id") or item.get("site_id"),
            "source_site_name": item.get("site_name"),
            "source_site_type": item.get("site_type"),
            "query": item.get("query"),
            "site_status": (item.get("state") or {}).get("status"),
            "result_count": item.get("result_count"),
            "evidence_path": item.get("evidence_path"),
            "url": item.get("url"),
        }
        records = list(item.get("records") or [])
        if records:
            for index, record in enumerate(records, start=1):
                rows.append(
                    {
                        **common,
                        "record_kind": "candidate_record",
                        "record_index": index,
                        "record_title": record.get("text"),
                        "record_url": record.get("href"),
                    }
                )
        else:
            rows.append(
                {
                    **common,
                    "record_kind": "site_status",
                    "record_index": 0,
                    "record_title": (item.get("state") or {}).get("reason") or (item.get("state") or {}).get("status"),
                    "record_url": item.get("url"),
                }
            )
        export_plan = item.get("official_export_candidates") or {}
        safe_exports = export_plan.get("safe_candidates") if isinstance(export_plan, dict) else []
        for index, candidate in enumerate(safe_exports or [], start=1):
            rows.append(
                {
                    **common,
                    "record_kind": "official_export_candidate",
                    "record_index": index,
                    "record_title": candidate.get("label"),
                    "record_url": candidate.get("href"),
                    "export_kind": candidate.get("kind"),
                }
            )
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields: list[str] = []
    for row in rows:
        for key in row:
            if key not in fields:
                fields.append(key)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_advanced_run_report(evidence: list[dict[str, Any]], out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = flatten_advanced_records(evidence)
    run_path = out_dir / "advanced_run.json"
    jsonl_path = out_dir / "advanced_records.jsonl"
    csv_path = out_dir / "advanced_records.csv"
    source_index_path = out_dir / "source_index.json"
    report = {
        "generated_at": now_stamp(),
        "sites": evidence,
        "merged_record_count": len(rows),
    }
    source_index = {
        str(item.get("source_site_id") or item.get("site_id")): {
            "site_name": item.get("site_name"),
            "status": (item.get("state") or {}).get("status"),
            "result_count": item.get("result_count"),
            "evidence_path": item.get("evidence_path"),
        }
        for item in evidence
    }
    run_path.write_text(json.dumps(redact_json_value(report), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_jsonl(jsonl_path, redact_json_value(rows))
    write_csv(csv_path, redact_json_value(rows))
    source_index_path.write_text(json.dumps(redact_json_value(source_index), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {
        "advanced_run_json": str(run_path),
        "advanced_records_jsonl": str(jsonl_path),
        "advanced_records_csv": str(csv_path),
        "source_index": str(source_index_path),
    }


async def js_fill_advanced_form(page: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return await page.evaluate(
        """({rows, denyTerms}) => {
            function visible(el) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return !!(rect.width || rect.height) && style.display !== 'none' && style.visibility !== 'hidden';
            }
            function badInput(el) {
                const hay = [
                    el.type, el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title
                ].join(' ').toLowerCase();
                return /(date|year|from|to|code)/.test(hay) || denyTerms.some(term => hay.includes(String(term).toLowerCase()));
            }
            const selectors = 'textarea,input[type="text"],input[type="search"],input:not([type]),[contenteditable="true"]';
            const inputs = Array.from(document.querySelectorAll(selectors)).filter(el => visible(el) && !badInput(el));
            const selects = Array.from(document.querySelectorAll('select')).filter(el => visible(el));
            const selected = [];
            rows.forEach((row, index) => {
                const select = selects[index];
                if (select) {
                    const target = String(row.field || '').toLowerCase();
                    const option = Array.from(select.options || []).find(opt => String(opt.textContent || '').toLowerCase().includes(target));
                    if (option) {
                        select.value = option.value;
                        select.dispatchEvent(new Event('change', {bubbles: true}));
                        selected.push({index, field: row.field, option: option.textContent});
                    }
                }
            });
            const filled = [];
            rows.forEach((row, index) => {
                const input = inputs[index];
                if (!input) return;
                if (input.isContentEditable) {
                    input.focus();
                    input.textContent = row.value || '';
                    input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: row.value || ''}));
                } else {
                    input.focus();
                    input.value = row.value || '';
                    input.dispatchEvent(new Event('input', {bubbles: true}));
                    input.dispatchEvent(new Event('change', {bubbles: true}));
                }
                filled.push({
                    index,
                    field: row.field,
                    value_length: String(row.value || '').length,
                    tag: input.tagName.toLowerCase(),
                    name: input.name || '',
                    id: input.id || '',
                    placeholder: input.placeholder || ''
                });
            });
            return {filled, selected, input_count: inputs.length, select_count: selects.length};
        }""",
        {"rows": rows, "denyTerms": FORM_INPUT_DENY_TERMS},
    )


async def fill_incopat_search(page: Any, plan: dict[str, Any]) -> dict[str, Any]:
    query = str(plan.get("query") or "")
    for selector in (
        "input#searchValue",
        "textarea#searchValue",
        "input[name='searchValue']",
        "input[name='keywordValue']",
        "input[id^='keywordValue']",
        "input[name='mainMessageInput']",
    ):
        locator = page.locator(selector).first
        try:
            if not await locator.is_visible(timeout=1200):
                continue
            await locator.click(timeout=4000)
            await locator.fill(query)
            return {"action": "fill_incopat_search", "selector": selector, "filled": True}
        except Exception:
            continue
    return {"action": "fill_incopat_search", "filled": False}


async def click_search_button(page: Any, site_id: str = "") -> dict[str, Any]:
    for selector in search_button_candidates(site_id):
        try:
            locator = page.locator(selector).first
            if await locator.is_visible(timeout=1000):
                await locator.click(timeout=5000)
                await wait_settle(page, 30000)
                return {"action": "click_search_button", "status": "clicked", "selector": selector}
        except Exception:
            pass
    for label in SEARCH_BUTTON_LABELS:
        try:
            locator = page.get_by_role("button", name=re.compile(re.escape(label), re.I)).first
            if await locator.is_visible(timeout=1000):
                await locator.click(timeout=5000)
                await wait_settle(page, 30000)
                return {"action": "click_search_button", "status": "clicked", "label": label, "role": "button"}
        except Exception:
            pass
        try:
            locator = page.get_by_text(label, exact=False).first
            if await locator.is_visible(timeout=1000):
                await locator.click(timeout=5000)
                await wait_settle(page, 30000)
                return {"action": "click_search_button", "status": "clicked", "label": label, "role": "text"}
        except Exception:
            pass
    try:
        await page.keyboard.press("Enter")
        await wait_settle(page, 30000)
        return {"action": "submit_by_enter", "status": "pressed"}
    except Exception as exc:
        return {"action": "click_search_button", "status": "not_found", "error": str(exc)}


async def apply_filter_round(page: Any, label: str, timeout_ms: int) -> dict[str, Any]:
    if re.search(r"\b\d{4}\s*-\s*\d{4}\b", label):
        return {"action": "filter_round", "label": label, "status": "planned_year_range_not_auto_clicked"}
    try:
        locator = page.get_by_text(label, exact=False).first
        if not await locator.is_visible(timeout=1500):
            return {"action": "filter_round", "label": label, "status": "not_visible"}
        await locator.click(timeout=5000)
        await wait_settle(page, timeout_ms)
        return {"action": "filter_round", "label": label, "status": "clicked"}
    except Exception as exc:
        return {"action": "filter_round", "label": label, "status": "error", "error": str(exc)}


def merge_registry_and_dom_exports(
    plan: dict[str, Any],
    elements: list[dict[str, Any]],
    *,
    allow_fulltext_download: bool,
) -> dict[str, Any]:
    safe = list((plan.get("export") or {}).get("safe_candidates") or [])
    blocked = list((plan.get("export") or {}).get("blocked_candidates") or [])
    seen = {(item.get("label"), item.get("href")) for item in safe + blocked}
    for candidate in extract_filter_candidates(elements, limit=160):
        label = candidate.get("label")
        href = candidate.get("href")
        classified = classify_export_control(label, href, allow_fulltext_download=allow_fulltext_download)
        classified.update(
            {
                "selector": candidate.get("selector"),
                "tag": candidate.get("tag"),
                "visible": candidate.get("visible"),
                "source": "live_dom",
            }
        )
        key = (classified.get("label"), classified.get("href"))
        if key in seen:
            continue
        seen.add(key)
        if classified["safe"]:
            safe.append(classified)
        else:
            blocked.append(classified)
    return {
        **(plan.get("export") or {}),
        "safe_candidates": safe,
        "blocked_candidates": blocked,
    }


async def maybe_click_export(page: Any, export_plan: dict[str, Any], args: argparse.Namespace, site_dir: Path) -> dict[str, Any]:
    if not getattr(args, "click_export", False):
        return {"action": "official_export", "status": "not_clicked", "reason": "click_export flag not set"}
    if export_plan.get("mode") == "none":
        return {"action": "official_export", "status": "skipped", "reason": "export mode none"}
    candidates = [item for item in export_plan.get("safe_candidates") or [] if item.get("safe")]
    if not candidates:
        return {"action": "official_export", "status": "no_safe_candidate"}
    candidate = candidates[0]
    selector = candidate.get("selector")
    try:
        if selector:
            locator = page.locator(selector).first
        else:
            locator = page.get_by_text(str(candidate.get("label") or ""), exact=False).first
        if not await locator.is_visible(timeout=2000):
            return {"action": "official_export", "status": "candidate_not_visible", "candidate": candidate}
        try:
            async with page.expect_download(timeout=8000) as download_info:
                await locator.click(timeout=5000)
            download = await download_info.value
            target = site_dir / (download.suggested_filename or f"official_export_{int(time.time())}.download")
            await download.save_as(str(target))
            return {"action": "official_export", "status": "downloaded", "candidate": candidate, "path": str(target)}
        except Exception:
            await locator.click(timeout=5000)
            await wait_settle(page, 15000)
            return {"action": "official_export", "status": "clicked_no_download", "candidate": candidate}
    except Exception as exc:
            return {"action": "official_export", "status": "error", "candidate": candidate, "error": str(exc)}


async def maybe_wait_for_post_submit_checkpoint(page: Any, site: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
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
    raw_anchors = await collect_anchors(page)
    records = extract_site_records(str(site["id"]), raw_anchors, html, visible_text, page.url)
    checkpoint = should_mark_manual_checkpoint(str(site.get("id")), page.url, title, visible_text, records)
    if not should_wait_after_checkpoint(checkpoint, int(getattr(args, "manual_wait_seconds", 0)), records):
        return {"action": "post_submit_checkpoint_probe", "checkpoint": checkpoint, "waited": False}
    await page.wait_for_timeout(int(args.manual_wait_seconds) * 1000)
    await wait_settle(page, args.timeout_ms)
    return {"action": "post_submit_manual_wait", "checkpoint": True, "waited": True, "seconds": int(args.manual_wait_seconds)}


async def capture_evidence(
    page: Any,
    site: dict[str, Any],
    plan: dict[str, Any],
    site_dir: Path,
    actions: list[dict[str, Any]],
    started: float,
    args: argparse.Namespace,
    *,
    status_hint: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
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
    stem = f"{safe_name(site['id'])}_advanced_{digest[:12]}"
    html_path = site_dir / f"{stem}.html"
    text_path = site_dir / f"{stem}.txt"
    dom_path = site_dir / f"{stem}_interactive_dom.json"
    evidence_path = site_dir / f"{safe_name(site['id'])}_advanced_evidence.json"
    screenshot_path: Path | None = None
    html_path.write_text(html, encoding="utf-8", errors="replace")
    text_path.write_text(visible_text, encoding="utf-8", errors="replace")
    if getattr(args, "save_screenshot", False):
        screenshot_path = site_dir / f"{stem}.png"
        try:
            await page.screenshot(path=str(screenshot_path), full_page=True)
        except Exception as exc:
            actions.append({"action": "screenshot_error", "error": str(exc)})
            screenshot_path = None
    raw_anchors = await collect_anchors(page)
    records = extract_site_records(str(site["id"]), raw_anchors, html, visible_text, page.url)
    interactive_elements = await collect_interactive_dom(page, getattr(args, "element_limit", 500))
    interactive_elements = redact_json_value(interactive_elements)
    dom_path.write_text(json.dumps(interactive_elements, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    official_exports = merge_registry_and_dom_exports(
        plan,
        interactive_elements,
        allow_fulltext_download=bool(getattr(args, "allow_fulltext_download", False)),
    )
    result_count = extract_advanced_result_count(visible_text)
    status = infer_status_hint(status_hint, result_count, records)
    state = classify_page_state(site, title, visible_text, status)
    if reason:
        state["reason"] = reason
    if should_mark_manual_checkpoint(str(site.get("id")), page.url, title, visible_text, records):
        state["status"] = "manual_checkpoint"
        state["reason"] = state.get("reason") or "site displayed login, verification, or unauthenticated public page"
    evidence = {
        "generated_at": now_stamp(),
        "source_site_id": site.get("id"),
        "site_id": site.get("id"),
        "site_name": site.get("name"),
        "site_type": site.get("type"),
        "query": plan.get("query"),
        "advanced_plan": plan,
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
            "interactive_dom": str(dom_path),
        },
        "records": records,
        "export_links": [item for item in official_exports.get("safe_candidates") or [] if item.get("source") == "live_dom"],
        "official_export_candidates": official_exports,
        "filter_candidates": extract_filter_candidates(interactive_elements),
        "selector_suggestions": suggest_selectors(str(site["id"]), interactive_elements),
    }
    evidence = redact_json_value(evidence)
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    evidence["evidence_path"] = str(evidence_path)
    return evidence


async def prepare_site_page(page: Any, site: dict[str, Any], plan: dict[str, Any], args: argparse.Namespace, actions: list[dict[str, Any]]) -> None:
    site_id = str(site.get("id") or "")
    advanced_url = str(plan.get("advanced_search_url") or site.get("home_url"))
    prelogin_done = False
    if site.get("ip_login_before_search") and getattr(args, "try_ip_login", True):
        await page.goto(str(site.get("home_url")), wait_until="domcontentloaded", timeout=args.timeout_ms)
        actions.append({"action": "goto_home_for_ip_login", "url": site.get("home_url")})
        await wait_settle(page, args.timeout_ms)
        actions.append(await click_ip_access_if_present(page, site))
        prelogin_done = True
    await page.goto(advanced_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
    actions.append({"action": "goto_advanced_search", "url": advanced_url})
    await wait_settle(page, args.timeout_ms)
    if site_id == "incopat":
        title = await page.title()
        text = await page.locator("body").inner_text(timeout=5000)
        if requires_manual_checkpoint(site_id, page.url, title, text) and getattr(args, "try_ip_login", True):
            for login_url in INCO_PAT_LOGIN_URLS:
                try:
                    await page.goto(login_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                    actions.append({"action": "goto_incopat_ip_login", "url": login_url})
                    await wait_settle(page, args.timeout_ms)
                    step = await click_selector_if_visible(page, "input#ipLoginBtn", timeout_ms=2500)
                    actions.append({"action": "click_incopat_ip_login_button", **step})
                    if step.get("status") == "clicked":
                        break
                except Exception as exc:
                    actions.append({"action": "incopat_ip_login_error", "url": login_url, "error": str(exc)})
            await page.goto(advanced_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
            actions.append({"action": "return_to_incopat_advanced", "url": advanced_url})
            await wait_settle(page, args.timeout_ms)
    elif getattr(args, "try_ip_login", True) and should_click_ip_access_on_advanced(site, prelogin_done=prelogin_done):
        actions.append(await click_ip_access_if_present(page, site))


async def execute_site_plan(context: Any, site: dict[str, Any], plan: dict[str, Any], out_dir: Path, args: argparse.Namespace) -> dict[str, Any]:
    site_dir = out_dir / "evidence" / safe_name(str(site["id"]))
    site_dir.mkdir(parents=True, exist_ok=True)
    actions: list[dict[str, Any]] = []
    page = await context.new_page()
    started = time.monotonic()
    try:
        await prepare_site_page(page, site, plan, args, actions)
        if getattr(args, "manual_wait_seconds", 0) > 0:
            actions.append({"action": "manual_checkpoint_wait", "seconds": args.manual_wait_seconds})
            await page.wait_for_timeout(args.manual_wait_seconds * 1000)
        if str(site.get("id")) == "incopat":
            actions.append(await fill_incopat_search(page, plan))
        if should_use_generic_advanced_form(site):
            fill_result = await js_fill_advanced_form(page, list(plan["rounds"][0]["query_rows"]))
            actions.append({"action": "fill_advanced_form", **fill_result})
        else:
            actions.append({"action": "fill_advanced_form", "status": "skipped_site_specific_adapter"})
        actions.append(await click_search_button(page, str(site.get("id") or "")))
        actions.append(await maybe_wait_for_post_submit_checkpoint(page, site, args))
        for round_plan in plan.get("rounds", [])[1:]:
            actions.append(await apply_filter_round(page, str(round_plan.get("label") or ""), args.timeout_ms))
        pre_export = await collect_interactive_dom(page, getattr(args, "element_limit", 500))
        export_plan = merge_registry_and_dom_exports(
            plan,
            redact_json_value(pre_export),
            allow_fulltext_download=bool(getattr(args, "allow_fulltext_download", False)),
        )
        actions.append(await maybe_click_export(page, export_plan, args, site_dir))
        return await capture_evidence(page, site, plan, site_dir, actions, started, args)
    except Exception as exc:
        return write_site_error_evidence(site, str(plan.get("query") or ""), out_dir / "evidence", exc, actions)
    finally:
        try:
            await page.close()
        except Exception:
            pass


def resolve_sites(args: argparse.Namespace, registry: dict[str, Any]) -> list[str]:
    sites = split_list(args.sites)
    if sites:
        return sites
    configured = {str(site.get("id")) for site in registry.get("sites", [])}
    return [site_id for site_id in DEFAULT_ADVANCED_SITES if site_id in configured]


def build_plans_from_args(args: argparse.Namespace, registry: dict[str, Any]) -> list[dict[str, Any]]:
    if not args.query:
        raise SystemExit("Pass --query.")
    filters = split_list(getattr(args, "filters", None))
    plans = []
    for site_id in resolve_sites(args, registry):
        site = find_site(registry, site_id)
        plans.append(
            build_advanced_site_plan(
                site,
                args.query,
                strategy=args.strategy,
                filters=filters,
                export_mode=args.export_mode,
                max_filter_rounds=args.max_filter_rounds,
                allow_fulltext_download=bool(getattr(args, "allow_fulltext_download", False)),
            )
        )
    return plans


def cmd_plan(args: argparse.Namespace) -> int:
    registry = load_json(Path(args.registry))
    plans = build_plans_from_args(args, registry)
    result = {"generated_at": now_stamp(), "plans": plans}
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(redact_json_value(result), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(redact_json_value(result), indent=2, ensure_ascii=False))
    return 0


async def cmd_run_async(args: argparse.Namespace) -> int:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit(f"Playwright is not installed: {exc}") from exc
    registry = load_json(Path(args.registry))
    plans = build_plans_from_args(args, registry)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)
    evidence: list[dict[str, Any]] = []
    async with async_playwright() as p:
        cdp_endpoint = cdp_endpoint_from_args(args)
        if cdp_endpoint:
            launched_proc = launch_cdp_browser_process(args, profile_dir) if args.launch_cdp else None
            browser = await p.chromium.connect_over_cdp(cdp_endpoint, timeout=args.timeout_ms)
            try:
                context = browser.contexts[0] if browser.contexts else await browser.new_context()
                for plan in plans:
                    site = find_site(registry, str(plan["site_id"]))
                    evidence.append(await execute_site_plan(context, site, plan, out_dir, args))
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
                for plan in plans:
                    site = find_site(registry, str(plan["site_id"]))
                    evidence.append(await execute_site_plan(context, site, plan, out_dir, args))
            finally:
                await context.close()
    outputs = write_advanced_run_report(evidence, out_dir)
    print(json.dumps({"status": "written", "outputs": outputs, "sites": [item.get("site_id") for item in evidence]}, indent=2, ensure_ascii=False))
    return 0


def add_common_plan_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    parser.add_argument("--sites", help="Comma/semicolon/newline separated site ids. Defaults to cnki;wanfang;vip;incopat.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--strategy", choices=["balanced", "recall", "precision", "novelty"], default="balanced")
    parser.add_argument("--filters", help="Comma/semicolon/newline separated result-page filter labels to click in order.")
    parser.add_argument("--max-filter-rounds", type=int, default=3)
    parser.add_argument("--export-mode", choices=["none", "metadata", "citation", "analysis"], default="metadata")
    parser.add_argument("--allow-fulltext-download", action="store_true", help="Allow full-text/PDF/bulk download controls. Default blocks them.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run advanced-search form fill, multi-round filtering, and official-export-first evidence collection.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    plan = sub.add_parser("plan", help="Build a machine-readable advanced-search plan without opening a browser.")
    add_common_plan_args(plan)
    plan.add_argument("--out", help="Optional JSON output path.")
    plan.set_defaults(func=cmd_plan)

    run = sub.add_parser("run", help="Execute advanced-search plans in a visible browser or dedicated CDP session.")
    add_common_plan_args(run)
    run.add_argument("--out-dir", required=True)
    run.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    run.add_argument("--channel", help="Optional browser channel such as chrome, msedge, or chromium.")
    run.add_argument("--headless", action="store_true", help="Only for public smoke checks; paid resources should stay visible.")
    run.add_argument("--try-ip-login", dest="try_ip_login", action="store_true", default=True)
    run.add_argument("--no-ip-login", dest="try_ip_login", action="store_false")
    run.add_argument("--manual-wait-seconds", type=int, default=0)
    run.add_argument("--timeout-ms", type=int, default=45000)
    run.add_argument("--width", type=int, default=1440)
    run.add_argument("--height", type=int, default=1000)
    run.add_argument("--locale", default="zh-CN")
    run.add_argument("--element-limit", type=int, default=700)
    run.add_argument("--save-screenshot", action="store_true", help="Save screenshots. Off by default to reduce private-page leakage.")
    run.add_argument("--click-export", action="store_true", help="Click the first safe official citation/metadata export candidate.")
    add_cdp_arguments(run)
    run.set_defaults(func=lambda args: __import__("asyncio").run(cmd_run_async(args)))
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
