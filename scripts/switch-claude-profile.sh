#!/usr/bin/env bash
# Switch the active Claude session to a specific local profile.
# Useful when the canonical claude-9224 profile is logged out and a
# different Claude account is captured in another profile dir, or
# when verifying which profile holds a live sessionKey.
#
# Usage:
#   scripts/switch-claude-profile.sh <profile-name>
#   scripts/switch-claude-profile.sh --list           # show local claude.ai cookie state per profile
#
# Behavior:
#   1. Inspect target profile's Cookies for live sessionKey vs logout-only sessionKeyLC.
#   2. If sessionKey is absent, warn and require --force to proceed.
#   3. Close any running Claude chromes (all known claude profiles).
#   4. Clean stale SingletonLock for target.
#   5. Launch target on its registered cdpPort.
#   6. Open https://claude.ai/ in a tab named session-<profile>.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

CLI="node dist/src/cli.js"
REG=data/browser-profiles/profiles.json

list_claude_profiles() {
  python3 - <<'PY'
import json, sqlite3, os, shutil, tempfile, datetime, sys

reg = json.load(open("data/browser-profiles/profiles.json"))
claudes = [p for p in reg["profiles"] if "claude" in p["profileName"].lower()]
if not claudes:
    print("No claude profiles in registry.", file=sys.stderr); sys.exit(0)

print(f"{'profile':<20} {'port':<6} {'sessionKey':<11} {'sessionKeyLC':<13} {'last_access':<20}")
print("-" * 75)
for p in claudes:
    name = p["profileName"]
    port = p.get("cdpPort", "?")
    ck = f"{p['profileDir']}/Default/Cookies"
    if not os.path.exists(ck):
        print(f"{name:<20} {port:<6} {'?':<11} {'?':<13} no-cookies")
        continue
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False).name
    try:
        shutil.copy2(ck, tmp)
        conn = sqlite3.connect(tmp)
        cur = conn.cursor()
        sk = cur.execute(
            "SELECT COUNT(*) FROM cookies WHERE host_key LIKE '%claude.ai%' AND name = 'sessionKey'"
        ).fetchone()[0]
        skLC = cur.execute(
            "SELECT COUNT(*) FROM cookies WHERE host_key LIKE '%claude.ai%' AND name = 'sessionKeyLC'"
        ).fetchone()[0]
        last = cur.execute(
            "SELECT MAX(last_access_utc) FROM cookies WHERE host_key LIKE '%claude.ai%'"
        ).fetchone()[0]
        if last:
            last_dt = datetime.datetime(1601, 1, 1) + datetime.timedelta(microseconds=last)
            last_s = last_dt.strftime("%Y-%m-%d %H:%M")
        else:
            last_s = "N/A"
        conn.close()
    finally:
        os.unlink(tmp)
    print(f"{name:<20} {port:<6} {sk:<11} {skLC:<13} {last_s:<20}")
PY
}

inspect_cookies() {
  local target="$1"
  python3 - "$target" <<'PY'
import json, sqlite3, os, shutil, tempfile, sys

target = sys.argv[1]
reg = json.load(open("data/browser-profiles/profiles.json"))
match = [p for p in reg["profiles"] if p["profileName"] == target]
if not match:
    print(f"ERROR: profile {target!r} not in registry", file=sys.stderr); sys.exit(2)
p = match[0]
print(f"profile={target} port={p.get('cdpPort','?')} dir={p['profileDir']}")
ck = f"{p['profileDir']}/Default/Cookies"
if not os.path.exists(ck):
    print(f"  cookies file missing — profile has never been used", file=sys.stderr); sys.exit(3)

tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False).name
try:
    shutil.copy2(ck, tmp)
    conn = sqlite3.connect(tmp)
    cur = conn.cursor()
    sk = cur.execute(
        "SELECT COUNT(*) FROM cookies WHERE host_key LIKE '%claude.ai%' AND name = 'sessionKey'"
    ).fetchone()[0]
    skLC = cur.execute(
        "SELECT COUNT(*) FROM cookies WHERE host_key LIKE '%claude.ai%' AND name = 'sessionKeyLC'"
    ).fetchone()[0]
    conn.close()
finally:
    os.unlink(tmp)

print(f"  sessionKey count: {sk}")
print(f"  sessionKeyLC count: {skLC}")
sys.exit(0 if sk > 0 else 1)
PY
}

get_port() {
  python3 - "$1" <<'PY'
import json, sys
reg = json.load(open("data/browser-profiles/profiles.json"))
target = sys.argv[1]
match = [p for p in reg["profiles"] if p["profileName"] == target]
if not match:
    sys.exit(2)
print(match[0].get("cdpPort", ""))
PY
}

if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
  list_claude_profiles
  exit 0
fi

target="${1:-}"
force="${2:-}"
if [ -z "$target" ]; then
  echo "Usage: $0 <profile-name> [--force]" >&2
  echo "       $0 --list                      # show claude.ai cookie state per profile" >&2
  exit 2
fi

echo "=== cookie state for '$target' ==="
if ! inspect_cookies "$target"; then
  echo ""
  echo "⚠ target profile has NO live sessionKey — likely logged out."
  if [ "$force" != "--force" ]; then
    echo "Refusing to switch. Re-run with --force if you intend to switch anyway"
    echo "(e.g. so the user can log in via the GUI)."
    exit 3
  fi
  echo "--force given, proceeding"
fi

port=$(get_port "$target")
if [ -z "$port" ]; then
  echo "ERROR: profile '$target' not in registry" >&2
  exit 2
fi

if [ ! -f dist/src/cli.js ]; then
  echo "ERROR: dist/src/cli.js missing — run \`npm run build\` first" >&2
  exit 2
fi

echo ""
echo "=== closing any running Claude chromes ==="
python3 - <<'PY' | while read -r p; do
  echo "[close] $p"; node dist/src/cli.js browser:close --profile "$p" --json 2>&1 | head -1 || true
done
import json
reg = json.load(open("data/browser-profiles/profiles.json"))
for p in reg["profiles"]:
    if "claude" in p["profileName"].lower():
        print(p["profileName"])
PY

sleep 2

echo ""
echo "=== cleaning stale SingletonLock for $target ==="
rm -f "data/browser-profiles/$target/SingletonLock" \
      "data/browser-profiles/$target/SingletonCookie" \
      "data/browser-profiles/$target/SingletonSocket" 2>/dev/null || true

echo ""
echo "=== launching $target on port $port ==="
node dist/src/cli.js browser:launch --profile "$target" --cdp-port "$port" --json | head -10
sleep 2

echo ""
echo "=== opening claude.ai ==="
node dist/src/cli.js browser:tab:alloc --profile "$target" --url "https://claude.ai/" --tab-id "session-$target" --json | head -8

echo ""
echo "✓ Active Claude profile is now: $target (port $port)"
echo "  Verify login state in the Chrome window."
