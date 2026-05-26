#!/usr/bin/env bash
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT_DIR=".runs/postship-fix-wave-3/workflows"
mkdir -p "$OUT_DIR"
INDEX="$OUT_DIR/run-index.tsv"
: > "$INDEX"

YAMLS=(
  "examples/workflows/chatgpt-canvas-create-export-ext.yaml"
  "examples/workflows/chatgpt-deep-research-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-select-model-thinking-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-send-thinking-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-upload-single-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-gpts-converse-ext-fallback.yaml"
  "examples/workflows/chatgpt-chatgpt-upload-multi-ext.yaml"
  "examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml"
  "examples/workflows/chatgpt-generate-image-ext.yaml"
)

cleanup_chatgpt_tabs() {
  node <<'NODE'
const base = 'http://127.0.0.1:9223';
const home = 'https://chatgpt.com/';
async function request(path, init) {
  const res = await fetch(base + path, init);
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${path} -> ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}
(async () => {
  const tabs = await request('/json/list').catch(() => []);
  let keepHomeId = null;
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (tab.type !== 'page' || typeof tab.url !== 'string' || !tab.url.startsWith('https://chatgpt.com/')) continue;
    const isExactHome = tab.url === home;
    if (isExactHome && !keepHomeId) { keepHomeId = tab.id; continue; }
    await request('/json/close/' + encodeURIComponent(tab.id)).catch(() => null);
  }
  if (!keepHomeId) {
    await request('/json/new?' + encodeURIComponent(home), { method: 'PUT' })
      .catch(() => request('/json/new?' + encodeURIComponent(home)).catch(() => null));
  }
})().catch((error) => {
  console.error('cleanup_chatgpt_tabs:', error.message || String(error));
});
NODE
}

rate_like() {
  grep -Eiq '(^|[^0-9])429([^0-9]|$)|rate[-_ ]?limit|too many requests|temporarily rate|quota|cooldown' "$1" "$2" 2>/dev/null
}

count=${#YAMLS[@]}
for i in "${!YAMLS[@]}"; do
  yaml="${YAMLS[$i]}"
  id="$(basename "$yaml" .yaml)"
  out="$OUT_DIR/${id}.json"
  err="$OUT_DIR/${id}.stderr"
  echo "[$(date -Is)] cleanup before $id"
  cleanup_chatgpt_tabs
  echo "[$(date -Is)] run $((i+1))/$count $yaml"
  started="$(date -Is)"
  set +e
  node dist/src/cli.js workflow:run "$yaml" --json >"$out" 2>"$err"
  code=$?
  set -e
  finished="$(date -Is)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$yaml" "$out" "$code" "$started" "$finished" >> "$INDEX"
  echo "[$finished] exit=$code $id"
  cleanup_chatgpt_tabs
  if (( i + 1 < count )); then
    if rate_like "$out" "$err"; then
      echo "[$(date -Is)] rate-limit-like output detected; sleeping 120s before next yaml"
      sleep 120
    else
      echo "[$(date -Is)] sleeping 20s before next yaml"
      sleep 20
    fi
  fi
done
cleanup_chatgpt_tabs
