#!/usr/bin/env bash
set -euo pipefail

# Export OpenClaw PM memory chunks into a GitLab-backed PraxisBase staging file.
# Intended to be invoked by OpenClaw cron, not system cron.

PB_SQLITE_PATH="${PB_SQLITE_PATH:-/root/.openclaw/memory/pm.sqlite}"
PB_WORKDIR="${PB_WORKDIR:-/workspace/praxisbase-openclaw/state}"
PB_STATE_FILE="${PB_STATE_FILE:-$PB_WORKDIR/state.json}"
PB_GIT_REPO="${PB_GIT_REPO:?PB_GIT_REPO is required, e.g. https://gitlab.chehejia.com/sre/praxisbase.git}"
PB_GIT_BRANCH="${PB_GIT_BRANCH:-openclaw-ingest/answer-bot}"
PB_GIT_PATH="${PB_GIT_PATH:-.praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl}"
PB_AGENT_ID="${PB_AGENT_ID:-answer-bot}"
PB_LIMIT="${PB_LIMIT:-500}"
PB_DRY_RUN="${PB_DRY_RUN:-0}"
PB_GIT_USERNAME="${PB_GIT_USERNAME:-oauth2}"
PB_GIT_TOKEN="${PB_GIT_TOKEN:-}"

umask 077
mkdir -p "$PB_WORKDIR"

if [ ! -f "$PB_SQLITE_PATH" ]; then
  echo "praxisbase_export status=error rows=0 commit=none reason=sqlite_missing"
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "praxisbase_export status=error rows=0 commit=none reason=python3_missing"
  exit 2
fi

git_extra_header=""
if [ -n "$PB_GIT_TOKEN" ]; then
  basic_auth=$(python3 - <<'PY' "$PB_GIT_USERNAME" "$PB_GIT_TOKEN"
import base64
import sys
print(base64.b64encode(f"{sys.argv[1]}:{sys.argv[2]}".encode()).decode())
PY
)
  git_extra_header="Authorization: Basic ${basic_auth}"
fi

git_auth() {
  if [ -n "$git_extra_header" ]; then
    git -c "http.extraHeader=$git_extra_header" "$@"
  else
    git "$@"
  fi
}

repo_dir="$PB_WORKDIR/repo"
if [ ! -d "$repo_dir/.git" ]; then
  rm -rf "$repo_dir"
  git_auth clone --no-checkout "$PB_GIT_REPO" "$repo_dir" >/dev/null 2>&1
fi

cd "$repo_dir"
git config user.name "${PB_GIT_AUTHOR_NAME:-praxisbase-openclaw-exporter}"
git config user.email "${PB_GIT_AUTHOR_EMAIL:-praxisbase-openclaw-exporter@example.com}"
git_auth fetch origin "$PB_GIT_BRANCH" >/dev/null 2>&1 || true
if git rev-parse --verify --quiet "origin/$PB_GIT_BRANCH" >/dev/null; then
  git checkout -B "$PB_GIT_BRANCH" "origin/$PB_GIT_BRANCH" >/dev/null 2>&1
else
  git checkout --orphan "$PB_GIT_BRANCH" >/dev/null 2>&1 || git checkout -B "$PB_GIT_BRANCH" >/dev/null 2>&1
  git rm -r --cached . >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "$PB_GIT_PATH")"
touch "$PB_GIT_PATH"

export_result=$(python3 - <<'PY' "$PB_SQLITE_PATH" "$PB_STATE_FILE" "$PB_GIT_PATH" "$PB_AGENT_ID" "$PB_LIMIT"
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

db_path, state_path, output_path, agent_id, limit_raw = sys.argv[1:]
limit = int(limit_raw)
state_file = Path(state_path)
output_file = Path(output_path)

cursor = -1
if state_file.exists():
    try:
        state = json.loads(state_file.read_text())
        cursor = int(state.get("last_updated_at", -1))
    except Exception:
        cursor = -1

secret_patterns = [
    re.compile(r"(?i)\b(authorization\s*:\s*bearer\s+)[^\s]+"),
    re.compile(r"(?i)\b(cookie\s*:\s*)[^\n]+"),
    re.compile(r"(?i)\b((?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*)[^\s,;]+"),
]

def redact(text: str) -> str:
    value = text
    for pattern in secret_patterns:
        value = pattern.sub(lambda m: m.group(1) + "[REDACTED]", value)
    return value

query = """
SELECT id, path, source, start_line, end_line, hash, text, updated_at
FROM chunks
WHERE text IS NOT NULL
  AND length(trim(text)) > 0
  AND updated_at > ?
  AND lower(COALESCE(path, '')) NOT LIKE 'memory/dreaming/%'
  AND lower(COALESCE(path, '')) NOT LIKE '%/.dreams/%'
  AND lower(COALESCE(path, '')) NOT LIKE '%dream-diary%'
ORDER BY updated_at ASC, id ASC
LIMIT ?
"""

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
rows = [dict(row) for row in conn.execute(query, (cursor, limit))]

existing = {}
if output_file.exists():
    for line in output_file.read_text(errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
            ref = item.get("source_ref")
            if ref:
                existing[ref] = item
        except Exception:
            continue

max_updated_at = cursor
added = 0
for row in rows:
    text = redact(str(row.get("text") or ""))
    chunk_id = str(row.get("id") or "")
    source_ref = f"openclaw://{agent_id}/pm.sqlite/chunks/{chunk_id}"
    source_hash = "sha256:" + hashlib.sha256(json.dumps({"id": chunk_id, "path": row.get("path"), "text": text}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    summary = " ".join(part.strip() for part in text.splitlines() if part.strip())[:800]
    updated_at = int(row.get("updated_at") or 0)
    existing[source_ref] = {
        "id": chunk_id,
        "source_ref": source_ref,
        "source_hash": source_hash,
        "summary": summary,
        "text": text,
        "raw_log": text,
        "created_at": updated_at,
        "metadata": {
            "agent_id": agent_id,
            "path": row.get("path"),
            "source": row.get("source"),
            "start_line": row.get("start_line"),
            "end_line": row.get("end_line"),
        },
    }
    max_updated_at = max(max_updated_at, updated_at)
    added += 1

ordered = sorted(existing.values(), key=lambda item: (item.get("created_at") or 0, item.get("source_ref") or ""))
output_file.write_text("\n".join(json.dumps(item, ensure_ascii=False, sort_keys=True) for item in ordered) + ("\n" if ordered else ""))
print(json.dumps({"added": added, "last_updated_at": max_updated_at, "total": len(ordered)}))
PY
)

rows_added=$(python3 - <<'PY' "$export_result"
import json, sys
print(json.loads(sys.argv[1])["added"])
PY
)
last_updated_at=$(python3 - <<'PY' "$export_result"
import json, sys
print(json.loads(sys.argv[1])["last_updated_at"])
PY
)

if [ "$rows_added" = "0" ]; then
  echo "praxisbase_export status=skip rows=0 commit=none"
  exit 0
fi

git add -f "$PB_GIT_PATH"
if git diff --cached --quiet; then
  echo "praxisbase_export status=skip rows=0 commit=none"
  exit 0
fi

if [ "$PB_DRY_RUN" = "1" ]; then
  echo "praxisbase_export status=ok rows=$rows_added commit=dry-run"
  exit 0
fi

git commit -m "Export OpenClaw answer bot memory" >/dev/null 2>&1
commit_sha=$(git rev-parse --short HEAD)
git_auth push origin "HEAD:$PB_GIT_BRANCH" >/dev/null 2>&1

python3 - <<'PY' "$PB_STATE_FILE" "$last_updated_at" "$commit_sha"
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({"last_updated_at": int(sys.argv[2]), "last_commit": sys.argv[3]}, indent=2, sort_keys=True) + "\n")
PY

echo "praxisbase_export status=ok rows=$rows_added commit=$commit_sha"
