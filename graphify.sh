#!/usr/bin/env bash
# Build the project knowledge graph with Graphify (dev-only tool).
#
# Usage:
#   ./graphify.sh                 # full extract (AST + semantic pass over docs)
#   ./graphify.sh --force         # full re-scan, ignoring the incremental cache
#   ./graphify.sh query <term>    # pass through to any graphify CLI subcommand
#   ./graphify.sh god-nodes       # (path, explain, diagnose, cluster-only, ...)
#
# The first argument is checked against the graphify CLI subcommands; if it
# matches, the whole command is forwarded unchanged (so `./graphify.sh query
# BootServices` works like `graphify query BootServices`). Anything else
# defaults to `graphify extract .` (which also accepts --force).
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

# The CLI may live in the ephemeral bootstrap dir (Cloud Shell) — add it if
# present so the script also works from non-interactive shells.
if [[ -d "${CLOUDSHELL_BIN_DIR:-/tmp/cloudshell-bin}" ]]; then
  export PATH="${CLOUDSHELL_BIN_DIR:-/tmp/cloudshell-bin}:$PATH"
fi

# graphify subcommands other than `extract` (kept in sync with `graphify
# --help`). When the first argument is one of these, forward the whole call;
# otherwise fall through to `extract .`.
GRAPHIFY_COMMANDS=(
  add affected benchmark check-update clone cluster-only diagnose explain
  export extract god-nodes hook install label merge-driver merge-graphs path
  query reflect save-result tree uninstall update watch
  aider antigravity claude claw codebuddy codex copilot cursor devin droid
  gemini hermes kilo kiro opencode pi trae trae-cn vscode
)

if [[ $# -gt 0 ]]; then
  for cmd in "${GRAPHIFY_COMMANDS[@]}"; do
    if [[ "$1" == "$cmd" ]]; then
      exec graphify "$@"
    fi
  done
fi

exec graphify extract . "$@"
