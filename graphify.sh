#!/usr/bin/env bash
# Build the project knowledge graph with Graphify (dev-only tool).
#
# Usage:
#   ./graphify.sh            # full extract (AST + semantic pass over docs)
#   ./graphify.sh --force    # full re-scan, ignoring the incremental cache
#
# Requires: uv tool install "graphifyy[svg]"  (one-time)
# Env:      .env with GEMINI_API_KEY (see .env.example)
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export PATH="$HOME/.local/bin:$PATH"

exec graphify extract . "$@"
