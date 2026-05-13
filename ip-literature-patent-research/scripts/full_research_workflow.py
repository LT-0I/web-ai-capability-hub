from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import browser_research_runner as browser_runner  # noqa: E402


DEFAULT_REGISTRY = SCRIPT_DIR.parents[0] / "references" / "site_registry.json"
DEFAULT_PROFILE = Path.cwd() / "hba-agent-skills" / ".tmp" / "ip-literature-browser-profile"

PAID_STEM_SITE_IDS = [
    "incopat",
    "cnki",
    "wanfang",
    "vip",
    "web-of-science",
    "scopus",
    "ei-village",
    "inspec",
    "science-direct",
    "ieee-xplore",
    "acm-dl",
    "aiaa",
    "asce",
    "asme",
    "astm",
    "sae",
    "spie",
    "iet-digital-library",
    "springer-link",
    "wiley",
    "taylor-francis",
    "acs",
    "rsc",
    "iop",
    "aip",
    "aps",
    "nature",
    "science-online",
]

PUBLIC_PATENT_CROSSCHECK_SITE_IDS = ["patentscope", "espacenet"]

CSV_FIELDS = [
    "record_id",
    "record_kind",
    "source_site_id",
    "source_site_name",
    "source_type",
    "source_status",
    "query",
    "result_count",
    "record_title",
    "record_url",
    "evidence_path",
    "artifact_screenshot",
    "artifact_text",
    "captured_at",
]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def paid_stem_site_ids(registry: dict[str, Any]) -> list[str]:
    configured = {str(site.get("id")) for site in registry.get("sites", [])}
    return [site_id for site_id in PAID_STEM_SITE_IDS if site_id in configured]


def default_sites_for_mode(registry: dict[str, Any], mode: str, include_public_patent_crosscheck: bool = False) -> list[str]:
    paid = paid_stem_site_ids(registry)
    if mode == "patent":
        sites = [site_id for site_id in ["incopat"] if site_id in paid]
    elif mode == "literature":
        sites = [site_id for site_id in paid if site_id != "incopat"]
    else:
        sites = paid[:]
    if include_public_patent_crosscheck and mode in {"patent", "combined"}:
        configured = {str(site.get("id")) for site in registry.get("sites", [])}
        sites.extend(site_id for site_id in PUBLIC_PATENT_CROSSCHECK_SITE_IDS if site_id in configured)
    return sites


def stable_record_id(parts: list[Any]) -> str:
    text = "\n".join(str(part or "") for part in parts)
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:24]


def source_common(item: dict[str, Any]) -> dict[str, Any]:
    artifacts = item.get("artifacts") or {}
    state = item.get("state") or {}
    return {
        "source_site_id": item.get("site_id"),
        "source_site_name": item.get("site_name") or item.get("site_id"),
        "source_type": item.get("site_type"),
        "source_status": state.get("status"),
        "query": item.get("query"),
        "result_count": item.get("result_count"),
        "evidence_path": item.get("evidence_path"),
        "artifact_screenshot": artifacts.get("screenshot"),
        "artifact_text": artifacts.get("text"),
        "captured_at": item.get("generated_at"),
    }


def flatten_candidate_records(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in evidence:
        common = source_common(item)
        site_id = common.get("source_site_id")
        had_records = False

        for record in item.get("records") or []:
            title = str(record.get("text") or "").strip()
            url = str(record.get("href") or "").strip()
            if not title and not url:
                continue
            had_records = True
            rows.append(
                {
                    "record_id": stable_record_id([site_id, "candidate_record", title, url]),
                    "record_kind": "candidate_record",
                    "record_title": title,
                    "record_url": url,
                    **common,
                }
            )

        for link in item.get("export_links") or []:
            title = str(link.get("text") or "").strip()
            url = str(link.get("href") or "").strip()
            if not title and not url:
                continue
            had_records = True
            rows.append(
                {
                    "record_id": stable_record_id([site_id, "export_link", title, url]),
                    "record_kind": "export_link",
                    "record_title": title,
                    "record_url": url,
                    **common,
                }
            )

        if not had_records:
            rows.append(
                {
                    "record_id": stable_record_id([site_id, "site_status", common.get("source_status"), common.get("evidence_path")]),
                    "record_kind": "site_status",
                    "record_title": str(common.get("source_status") or "site status"),
                    "record_url": item.get("url") or "",
                    **common,
                }
            )
    return rows


def make_source_index(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    sources = []
    for item in evidence:
        state = item.get("state") or {}
        artifacts = item.get("artifacts") or {}
        sources.append(
            {
                "site_id": item.get("site_id"),
                "site_name": item.get("site_name") or item.get("site_id"),
                "site_type": item.get("site_type"),
                "query": item.get("query"),
                "status": state.get("status"),
                "result_count": item.get("result_count"),
                "url": item.get("url"),
                "evidence_path": item.get("evidence_path"),
                "html": artifacts.get("html"),
                "text": artifacts.get("text"),
                "screenshot": artifacts.get("screenshot"),
                "candidate_record_count": len(item.get("records") or []),
                "export_link_count": len(item.get("export_links") or []),
                "captured_at": item.get("generated_at"),
            }
        )
    return {"source_count": len(sources), "sources": sources}


def markdown_table_row(values: list[Any]) -> str:
    return "| " + " | ".join(str(value or "").replace("|", "\\|").replace("\n", " ") for value in values) + " |"


def evidence_matrix_markdown(evidence: list[dict[str, Any]], records: list[dict[str, Any]], mode: str) -> str:
    lines = [
        "# Evidence Matrix",
        "",
        f"Mode: {mode}",
        "",
        "## Source Status",
        "",
        "| Source | Type | Status | Result Count | Candidate Records | Export Links | Evidence |",
        "|---|---|---|---:|---:|---:|---|",
    ]
    for item in evidence:
        state = item.get("state") or {}
        lines.append(
            markdown_table_row(
                [
                    item.get("site_name") or item.get("site_id"),
                    item.get("site_type"),
                    state.get("status"),
                    item.get("result_count") if item.get("result_count") is not None else "",
                    len(item.get("records") or []),
                    len(item.get("export_links") or []),
                    item.get("evidence_path"),
                ]
            )
        )

    lines += [
        "",
        "## Merged Record Index",
        "",
        "| Kind | Source | Title | URL |",
        "|---|---|---|---|",
    ]
    for record in records[:200]:
        lines.append(
            markdown_table_row(
                [
                    record.get("record_kind"),
                    record.get("source_site_name"),
                    record.get("record_title"),
                    record.get("record_url"),
                ]
            )
        )
    return "\n".join(lines) + "\n"


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_merged_outputs(evidence: list[dict[str, Any]], plan: dict[str, Any] | None, mode: str, out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = flatten_candidate_records(evidence)
    source_index = make_source_index(evidence)

    merged_jsonl = out_dir / "merged_records.jsonl"
    merged_csv = out_dir / "merged_records.csv"
    source_index_path = out_dir / "source_index.json"
    evidence_matrix = out_dir / "evidence_matrix.md"
    draft = out_dir / "literature_novelty_draft.md"

    write_jsonl(merged_jsonl, rows)
    write_csv(merged_csv, rows)
    source_index_path.write_text(json.dumps(source_index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    evidence_matrix.write_text(evidence_matrix_markdown(evidence, rows, mode), encoding="utf-8")
    draft.write_text(browser_runner.synthesize_markdown(evidence, plan, mode), encoding="utf-8")

    return {
        "merged_jsonl": str(merged_jsonl),
        "merged_csv": str(merged_csv),
        "source_index": str(source_index_path),
        "evidence_matrix": str(evidence_matrix),
        "draft": str(draft),
        "record_count": str(len(rows)),
        "source_count": str(len(evidence)),
    }


def build_browser_command(args: argparse.Namespace, sites: list[str], evidence_dir: Path) -> list[str]:
    cmd = [
        sys.executable,
        str(SCRIPT_DIR / "browser_research_runner.py"),
        "run",
        "--registry",
        str(args.registry),
        "--sites",
        ";".join(sites),
        "--out-dir",
        str(evidence_dir),
        "--profile-dir",
        str(args.profile_dir),
        "--timeout-ms",
        str(args.timeout_ms),
        "--manual-wait-seconds",
        str(args.manual_wait_seconds),
    ]
    if args.plan:
        cmd.extend(["--plan", str(args.plan)])
    if args.query:
        cmd.extend(["--query", args.query])
    if args.channel:
        cmd.extend(["--channel", args.channel])
    if args.headless:
        cmd.append("--headless")
    if args.no_ip_login:
        cmd.append("--no-ip-login")
    if args.cdp_endpoint:
        cmd.extend(["--cdp-endpoint", args.cdp_endpoint])
    if args.launch_cdp:
        cmd.append("--launch-cdp")
    if args.cdp_port:
        cmd.extend(["--cdp-port", str(args.cdp_port)])
    if args.browser_executable:
        cmd.extend(["--browser-executable", args.browser_executable])
    if args.close_launched_cdp:
        cmd.append("--close-launched-cdp")
    return cmd


def resolve_sites(args: argparse.Namespace, registry: dict[str, Any], plan: dict[str, Any] | None) -> list[str]:
    if args.sites:
        return browser_runner.split_list(args.sites)
    if plan and plan.get("sites"):
        return list(plan.get("sites") or [])
    return default_sites_for_mode(registry, args.mode, args.include_public_patent_crosscheck)


def cmd_list_sites(args: argparse.Namespace) -> int:
    registry = load_json(Path(args.registry))
    for site_id in default_sites_for_mode(registry, args.mode, args.include_public_patent_crosscheck):
        print(site_id)
    return 0


def cmd_merge(args: argparse.Namespace) -> int:
    evidence = browser_runner.load_evidence_files(Path(args.evidence_dir))
    plan = load_json(Path(args.plan)) if args.plan else None
    outputs = write_merged_outputs(evidence, plan, args.mode, Path(args.out_dir))
    print(json.dumps({"status": "merged", **outputs}, indent=2, ensure_ascii=False))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    registry = load_json(Path(args.registry))
    plan = load_json(Path(args.plan)) if args.plan else None
    sites = resolve_sites(args, registry, plan)
    if not sites:
        raise SystemExit("No sites selected.")
    if not args.query and not args.plan:
        raise SystemExit("Pass --query or --plan.")

    out_dir = Path(args.out_dir)
    evidence_dir = out_dir / "evidence"
    merged_dir = out_dir / "merged"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    cmd = build_browser_command(args, sites, evidence_dir)
    completed = subprocess.run(cmd, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0:
        return completed.returncode

    evidence = browser_runner.load_evidence_files(evidence_dir)
    outputs = write_merged_outputs(evidence, plan, args.mode, merged_dir)
    run_report = {
        "status": "completed",
        "sites": sites,
        "evidence_dir": str(evidence_dir),
        "merged_dir": str(merged_dir),
        "outputs": outputs,
    }
    report_path = out_dir / "full_research_workflow_run.json"
    report_path.write_text(json.dumps(run_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(run_report, indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run paid STEM database searches and merge local evidence with source labels.")
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    sub = parser.add_subparsers(dest="cmd", required=True)

    list_sites = sub.add_parser("list-sites")
    list_sites.add_argument("--mode", choices=["literature", "patent", "combined"], default="combined")
    list_sites.add_argument("--include-public-patent-crosscheck", action="store_true")
    list_sites.set_defaults(func=cmd_list_sites)

    run = sub.add_parser("run")
    run.add_argument("--mode", choices=["literature", "patent", "combined"], default="combined")
    run.add_argument("--plan")
    run.add_argument("--query")
    run.add_argument("--sites", help="Comma/semicolon/newline separated site ids. Defaults to paid STEM databases for the selected mode.")
    run.add_argument("--include-public-patent-crosscheck", action="store_true", help="Add PATENTSCOPE/Espacenet for patent cross-checks.")
    run.add_argument("--out-dir", required=True)
    run.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    run.add_argument("--channel")
    run.add_argument("--headless", action="store_true", help="Use only for public smoke checks; paid resources should stay headed.")
    run.add_argument("--no-ip-login", action="store_true")
    run.add_argument("--manual-wait-seconds", type=int, default=0)
    run.add_argument("--timeout-ms", type=int, default=45000)
    run.add_argument("--cdp-endpoint", help="Connect to a dedicated existing Chrome/Edge CDP endpoint, for example http://127.0.0.1:9333.")
    run.add_argument("--launch-cdp", action="store_true", help="Start a real headed Chrome/Edge CDP browser on --cdp-port and connect to it.")
    run.add_argument("--cdp-port", type=int, default=9333, help="Dedicated CDP port used with --launch-cdp. Avoid 9222 when another workflow owns it.")
    run.add_argument("--browser-executable", help="Optional path to chrome.exe or msedge.exe for --launch-cdp.")
    run.add_argument("--close-launched-cdp", action="store_true", help="Close the browser started by --launch-cdp after the run. Default keeps it open for session reuse.")
    run.set_defaults(func=cmd_run)

    merge = sub.add_parser("merge")
    merge.add_argument("--mode", choices=["literature", "patent", "combined"], default="combined")
    merge.add_argument("--evidence-dir", required=True)
    merge.add_argument("--plan")
    merge.add_argument("--out-dir", required=True)
    merge.set_defaults(func=cmd_merge)

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
