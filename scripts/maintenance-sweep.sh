#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

run_id="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
run_dir="${MAINTENANCE_SWEEP_RUN_DIR:-.runs/maintenance-sweep/$run_id}"
mkdir -p "$run_dir" dist/scripts

log_file="$run_dir/maintenance-sweep.log"
{
  echo "[maintenance-sweep] repo=$repo_root"
  echo "[maintenance-sweep] run_dir=$run_dir"
  echo "[maintenance-sweep] DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY"
  echo "[maintenance-sweep] fresh build"
  rm -rf dist
  npm run build
  mkdir -p dist/scripts
  node --check scripts/maintenance-sweep.ts
  cp scripts/maintenance-sweep.ts dist/scripts/maintenance-sweep.js
  chmod +x dist/scripts/maintenance-sweep.js
  echo "[maintenance-sweep] running dist/scripts/maintenance-sweep.js"
  node dist/scripts/maintenance-sweep.js --run-dir "$run_dir" "$@"
} 2>&1 | tee "$log_file"
exit "${PIPESTATUS[0]}"
