from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ADAPTER_DIR = Path(__file__).resolve().parent
SCRIPT_DIR = ADAPTER_DIR.parent
SKILL_DIR = SCRIPT_DIR.parent
DEFAULT_REGISTRY = SKILL_DIR / "references" / "site_registry.json"
DEFAULT_OUT = Path.cwd() / "hba-agent-skills" / ".tmp" / "paid_resource_site_runs"
DEFAULT_PROFILE = Path.cwd() / "hba-agent-skills" / ".tmp" / "ip-literature-browser-profile"


def build_command(site_id: str, args: argparse.Namespace) -> list[str]:
    cmd = [
        sys.executable,
        str(SCRIPT_DIR / "browser_research_runner.py"),
        "run",
        "--registry",
        str(args.registry),
        "--sites",
        site_id,
        "--out-dir",
        str(Path(args.out_dir) / site_id),
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


def main_for_site(site_id: str, display_name: str | None = None) -> int:
    parser = argparse.ArgumentParser(description=f"Run a headed browser search for {display_name or site_id}.")
    parser.add_argument("--query", help="Search query to submit through the site's built-in search surface.")
    parser.add_argument("--plan", help="Optional research_session.py plan JSON. Used when --query is omitted.")
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT))
    parser.add_argument("--profile-dir", default=str(DEFAULT_PROFILE))
    parser.add_argument("--channel", help="Optional Playwright browser channel such as chrome or msedge.")
    parser.add_argument("--headless", action="store_true", help="Only for public smoke checks; paid resources should stay visible.")
    parser.add_argument("--no-ip-login", action="store_true", help="Skip visible IP/institutional access buttons.")
    parser.add_argument("--manual-wait-seconds", type=int, default=0, help="Pause for authorized manual checkpoint before retrying a search box.")
    parser.add_argument("--timeout-ms", type=int, default=45000)
    parser.add_argument("--cdp-endpoint", help="Connect to a dedicated existing Chrome/Edge CDP endpoint, for example http://127.0.0.1:9333.")
    parser.add_argument("--launch-cdp", action="store_true", help="Start a real headed Chrome/Edge CDP browser on --cdp-port and connect to it.")
    parser.add_argument("--cdp-port", type=int, default=9333, help="Dedicated CDP port used with --launch-cdp. Avoid 9222 when another workflow owns it.")
    parser.add_argument("--browser-executable", help="Optional path to chrome.exe or msedge.exe for --launch-cdp.")
    parser.add_argument("--close-launched-cdp", action="store_true", help="Close the browser started by --launch-cdp after the run. Default keeps it open for session reuse.")
    args = parser.parse_args()
    if not args.query and not args.plan:
        parser.error("pass --query or --plan")
    return subprocess.run(build_command(site_id, args), text=True, encoding="utf-8", errors="replace").returncode
