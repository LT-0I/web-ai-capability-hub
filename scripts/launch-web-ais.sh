#!/usr/bin/env bash
# Launch the three web-AI Chrome instances per the canonical mapping.
# Implements the procedure documented in
# .omc/skills/web-ai-launch-browsers/SKILL.md and CLAUDE.md §3.
#
# Usage:
#   scripts/launch-web-ais.sh [launch|close|status]
#       launch  (default) — kill stale chromes, clean locks, serially launch
#                           chatgpt / claude-9224 / gemini-9225, then open homepages
#       close            — close all three managed chromes
#       status           — print CDP /json/version probe for each port
#
# Env overrides:
#   DISPLAY        defaults to :0
#   XAUTHORITY     defaults to /run/user/$(id -u)/gdm/Xauthority
#   PROFILES       space-separated profile list (default: chatgpt claude-9224 gemini-9225)

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

CLI="node dist/src/cli.js"

# Canonical profile → port → homepage mapping. See SKILL.md.
declare -A PORT_OF=(
  [chatgpt]=9223
  [claude-9224]=9224
  [gemini-9225]=9225
)
declare -A HOME_OF=(
  [chatgpt]=https://chatgpt.com/
  [claude-9224]=https://claude.ai/
  [gemini-9225]=https://gemini.google.com/
)

PROFILES="${PROFILES:-chatgpt claude-9224 gemini-9225}"

clean_locks() {
  for p in $PROFILES default; do
    [ -d "data/browser-profiles/$p" ] && \
      rm -f "data/browser-profiles/$p/SingletonLock" \
            "data/browser-profiles/$p/SingletonCookie" \
            "data/browser-profiles/$p/SingletonSocket"
  done
  [ -d data/browser-profile ] && \
    rm -f data/browser-profile/Singleton{Lock,Cookie,Socket}
  return 0
}

probe_port() {
  local port="$1"
  curl -sS --max-time 3 "http://127.0.0.1:${port}/json/version" 2>/dev/null \
    | grep -oE '"Browser": *"[^"]+"' | head -1
}

cmd="${1:-launch}"

case "$cmd" in
  launch)
    if [ ! -f dist/src/cli.js ]; then
      echo "ERROR: dist/src/cli.js missing — run \`npm run build\` first" >&2
      exit 2
    fi
    echo "[clean] removing stale SingletonLock files"
    clean_locks

    for profile in $PROFILES; do
      port="${PORT_OF[$profile]:-}"
      url="${HOME_OF[$profile]:-}"
      if [ -z "$port" ] || [ -z "$url" ]; then
        echo "WARN: profile '$profile' has no canonical port/url mapping, skipping" >&2
        continue
      fi

      # If port already responding, skip launch
      if probe_port "$port" >/dev/null; then
        echo "[skip] $profile already up on port $port"
      else
        echo "[launch] $profile → port $port"
        $CLI browser:launch --profile "$profile" --cdp-port "$port" --json \
          > "/tmp/launch-${profile}.json" 2>&1
        if ! probe_port "$port" >/dev/null; then
          echo "  ✗ $profile failed to come up — see /tmp/launch-${profile}.json"
          continue
        fi
      fi

      tab_id="session-${profile}"
      echo "[tab] alloc $tab_id → $url"
      $CLI browser:tab:alloc --profile "$profile" --url "$url" --tab-id "$tab_id" --json \
        > "/tmp/tab-${profile}.json" 2>&1 || true
    done

    echo ""
    echo "=== status ==="
    for profile in $PROFILES; do
      port="${PORT_OF[$profile]:-?}"
      v=$(probe_port "$port" || echo "✗ down")
      printf "  %-15s port %s  %s\n" "$profile" "$port" "${v:-✗ down}"
    done
    echo ""
    echo "Tip: visually inspect each Chrome window to verify login state."
    echo "     If Claude shows /login, swap the active profile via:"
    echo "       scripts/switch-claude-profile.sh <other-profile-name>"
    ;;

  close)
    for profile in $PROFILES; do
      echo "[close] $profile"
      $CLI browser:close --profile "$profile" --json 2>&1 | head -3 || true
    done
    ;;

  status)
    for profile in $PROFILES; do
      port="${PORT_OF[$profile]:-?}"
      v=$(probe_port "$port" || echo "✗ down")
      printf "  %-15s port %s  %s\n" "$profile" "$port" "${v:-✗ down}"
    done
    ;;

  *)
    echo "Usage: $0 {launch|close|status}" >&2
    exit 2
    ;;
esac
