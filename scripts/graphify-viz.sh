#!/usr/bin/env bash
# Serve the Graphify knowledge-graph visualization for local viewing (VS Code
# port forwarding). Always uses the same port (8000), so the forwarded link
# never changes between sessions.
#
# Usage:
#   ./scripts/graphify-viz.sh          # start (idempotent) and print the URL
#
# The server runs inside a tmux session (`graphify-viz`) so it survives the
# terminal that started it. To stop it:
#   tmux kill-session -t graphify-viz
#
# To refresh the visualization before serving:
#   ./graphify.sh cluster-only .
#
# Requires: tmux (preview servers run inside tmux per AGENTS.md) and python3.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${GRAPHIFY_VIZ_PORT:-8000}"
SESSION="graphify-viz"
URL="http://localhost:$PORT/graph.html"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "graphify viz já está no ar: $URL (tmux session: $SESSION)"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "erro: python3 não encontrado." >&2
  exit 1
fi

tmux new-session -d -s "$SESSION" "python3 -m http.server $PORT --directory graphify-out"
sleep 1

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "erro: o tmux não iniciou o servidor." >&2
  exit 1
fi

echo "graphify viz no ar: $URL (tmux session: $SESSION)"
echo "Para parar: tmux kill-session -t $SESSION"
