#!/usr/bin/env bash
# 렙블룸 로컬 미리보기 — http://localhost:8050
cd "$(dirname "$0")"
PORT="${1:-8050}"
echo "▶ 렙블룸  http://localhost:$PORT  (Ctrl+C로 종료)"
python3 -m http.server "$PORT"
