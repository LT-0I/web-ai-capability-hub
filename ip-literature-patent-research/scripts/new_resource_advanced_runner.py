from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import advanced_search_runner as advanced  # noqa: E402
from browser_research_runner import (  # noqa: E402
    DEFAULT_PROFILE,
    add_cdp_arguments,
    cdp_endpoint_from_args,
    launch_cdp_browser_process,
    load_json,
    redact_json_value,
    split_list,
)


DEFAULT_PROFILE_PATH = SCRIPT_DIR.parents[0] / "references" / "new_resource_advanced_profiles.json"


def load_profiles(path: Path | str = DEFAULT_PROFILE_PATH) -> list[dict[str, Any]]:
    data = load_json(Path(path))
    profiles = data.get("resources") if isinstance(data, dict) else data
    if not isinstance(profiles, list):
        raise ValueError("profile file must contain a resources list")
    return [normalize_profile(profile) for profile in profiles]


def normalize_profile(profile: dict[str, Any]) -> dict[str, Any]:
    item = dict(profile)
    item.setdefault("type", "literature")
    item.setdefault("login_mode", "licensed_ip_or_institutional_sso")
    item.setdefault("requires_browser", True)
    item.setdefault("access_markers", [item.get("name") or item.get("id")])
    item.setdefault("login_markers", ["Login", "Sign in", "登录"])
    item.setdefault("stop_markers", ["captcha", "Access Denied", "验证码"])
    item.setdefault("search_box_selectors", ["input[type='search']", "input[type='text']", "textarea"])
    item.setdefault("advanced_search_fields", ["All fields", "Title", "Abstract"])
    item.setdefault("result_filter_facets", ["Year", "Subject", "Document type"])
    item.setdefault("sort_options", ["Relevance", "Newest"])
    item.setdefault("merge_options", ["Deduplicate by DOI/title"])
    item.setdefault("export_or_analysis_tools", ["Citation", "RIS", "BibTeX", "Export", "Download PDF"])
    item.setdefault("source_urls", [item.get("home_url")])
    if not item.get("advanced_search_url"):
        item["advanced_search_url"] = item.get("home_url") or item.get("search_url_template")
    return item


def profile_requires_manual_checkpoint(profile: dict[str, Any]) -> bool:
    mode = str(profile.get("login_mode") or "").lower()
    return bool(profile.get("manual_checkpoint_required") or "manual" in mode or "checkpoint" in mode)


def resolve_profiles(
    profiles: list[dict[str, Any]],
    raw_sites: str | None,
    group: str | None,
    *,
    include_checkpoint: bool = False,
) -> list[dict[str, Any]]:
    by_id = {str(profile["id"]): profile for profile in profiles}
    if raw_sites:
        requested = split_list(raw_sites)
        return [by_id[site_id] for site_id in requested if site_id in by_id]
    selected = []
    for profile in profiles:
        groups = {str(item) for item in profile.get("groups") or []}
        if group and group not in groups:
            continue
        if profile_requires_manual_checkpoint(profile) and not include_checkpoint:
            continue
        selected.append(profile)
    return selected


def build_new_resource_plan(
    profile: dict[str, Any],
    query: str,
    *,
    strategy: str = "balanced",
    filters: list[str] | None = None,
    export_mode: str = "metadata",
    max_filter_rounds: int = 3,
    allow_fulltext_download: bool = False,
) -> dict[str, Any]:
    plan = advanced.build_advanced_site_plan(
        normalize_profile(profile),
        query,
        strategy=strategy,
        filters=filters if filters is not None else list(profile.get("default_filter_rounds") or []),
        export_mode=export_mode,
        max_filter_rounds=max_filter_rounds,
        allow_fulltext_download=allow_fulltext_download,
    )
    plan["groups"] = list(profile.get("groups") or [])
    plan["manual_checkpoint_required"] = profile_requires_manual_checkpoint(profile)
    plan["source_profile"] = "new_resource_advanced_profiles"
    return plan


def build_plans_from_args(args: argparse.Namespace, profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected = resolve_profiles(
        profiles,
        args.sites,
        args.group,
        include_checkpoint=bool(args.include_checkpoint_sites or args.sites),
    )
    filters = split_list(args.filters)
    return [
        build_new_resource_plan(
            profile,
            args.query,
            strategy=args.strategy,
            filters=filters,
            export_mode=args.export_mode,
            max_filter_rounds=args.max_filter_rounds,
            allow_fulltext_download=bool(args.allow_fulltext_download),
        )
        for profile in selected
    ]


def cmd_list(args: argparse.Namespace) -> int:
    profiles = load_profiles(args.profile_file)
    for profile in profiles:
        marker = "checkpoint" if profile_requires_manual_checkpoint(profile) else "auto"
        groups = ",".join(profile.get("groups") or [])
        print(f"{profile['id']}\t{marker}\t{groups}\t{profile.get('name')}")
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    profiles = load_profiles(args.profile_file)
    plans = build_plans_from_args(args, profiles)
    payload = {"generated_at": advanced.now_stamp(), "plans": plans}
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(redact_json_value(payload), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(redact_json_value(payload), indent=2, ensure_ascii=False))
    return 0


async def cmd_run_async(args: argparse.Namespace) -> int:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit(f"Playwright is not installed: {exc}") from exc

    profiles = load_profiles(args.profile_file)
    by_id = {str(profile["id"]): profile for profile in profiles}
    plans = build_plans_from_args(args, profiles)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)
    evidence: list[dict[str, Any]] = []

    async with async_playwright() as p:
        cdp_endpoint = cdp_endpoint_from_args(args)
        launched_proc = launch_cdp_browser_process(args, profile_dir) if args.launch_cdp else None
        try:
            if cdp_endpoint:
                browser = await p.chromium.connect_over_cdp(cdp_endpoint, timeout=args.timeout_ms)
                context = browser.contexts[0] if browser.contexts else await browser.new_context()
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
                    profile = by_id[str(plan["site_id"])]
                    if profile_requires_manual_checkpoint(profile) and not args.run_checkpoint_sites:
                        evidence.append(
                            advanced.empty_site_evidence(
                                profile,
                                plan,
                                status="manual_checkpoint_required",
                                reason="profile requires a human login/security checkpoint before automated advanced search",
                                actions=[{"action": "skip_checkpoint_site", "site_id": profile["id"]}],
                            )
                        )
                        continue
                    evidence.append(await advanced.execute_site_plan(context, profile, plan, out_dir, args))
            finally:
                if not cdp_endpoint:
                    await context.close()
        finally:
            if args.close_launched_cdp and launched_proc is not None:
                launched_proc.terminate()
    outputs = advanced.write_advanced_run_report(evidence, out_dir)
    print(json.dumps({"status": "written", "outputs": outputs, "sites": [item.get("site_id") for item in evidence]}, indent=2, ensure_ascii=False))
    return 0


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--profile-file", type=Path, default=DEFAULT_PROFILE_PATH)
    parser.add_argument("--sites", help="Comma/semicolon/newline separated profile ids.")
    parser.add_argument("--group", choices=["rl-ai", "uav", "publisher", "engineering-books", "aviation-standards", "technology-reports", "patent", "materials", "review", "math-optimization"])
    parser.add_argument("--include-checkpoint-sites", action="store_true", help="Include profiles that need manual login/security checkpoints in group runs.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--strategy", choices=["balanced", "recall", "precision", "novelty"], default="balanced")
    parser.add_argument("--filters", help="Comma/semicolon/newline separated result-page filter labels to click in order.")
    parser.add_argument("--max-filter-rounds", type=int, default=3)
    parser.add_argument("--export-mode", choices=["none", "metadata", "citation", "analysis"], default="metadata")
    parser.add_argument("--allow-fulltext-download", action="store_true", help="Allow full-text/PDF/bulk download controls. Default blocks them.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Advanced-search runner for newly discovered online-navigation paid resources.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    list_cmd = sub.add_parser("list-sites")
    list_cmd.add_argument("--profile-file", type=Path, default=DEFAULT_PROFILE_PATH)
    list_cmd.set_defaults(func=cmd_list)

    plan = sub.add_parser("plan")
    add_common_args(plan)
    plan.add_argument("--out")
    plan.set_defaults(func=cmd_plan)

    run = sub.add_parser("run")
    add_common_args(run)
    run.add_argument("--out-dir", required=True)
    run.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    run.add_argument("--channel", help="Optional browser channel such as chrome, msedge, or chromium.")
    run.add_argument("--headless", action="store_true", help="Only for public smoke checks; paid resources should stay visible.")
    run.add_argument("--try-ip-login", dest="try_ip_login", action="store_true", default=True)
    run.add_argument("--no-ip-login", dest="try_ip_login", action="store_false")
    run.add_argument("--manual-wait-seconds", type=int, default=0)
    run.add_argument("--run-checkpoint-sites", action="store_true", help="Actually open sites marked as needing a manual checkpoint.")
    run.add_argument("--timeout-ms", type=int, default=45000)
    run.add_argument("--width", type=int, default=1440)
    run.add_argument("--height", type=int, default=1000)
    run.add_argument("--locale", default="zh-CN")
    run.add_argument("--element-limit", type=int, default=700)
    run.add_argument("--save-screenshot", action="store_true")
    run.add_argument("--click-export", action="store_true")
    add_cdp_arguments(run)
    run.set_defaults(func=lambda args: asyncio.run(cmd_run_async(args)))
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
