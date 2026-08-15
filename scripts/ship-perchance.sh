#!/usr/bin/env bash
#
# Ship the app to the `perchance` branch — the minimal upload set the
# Perchance workspace needs (tech-spec §4.3 upload protocol).
#
# The `perchance` branch contains ONLY:
#   index.html            → Perchance *HTML* panel (imports the app)
#   main.pjs              → Perchance *Lists* panel (imports the AI plugins)
#   src/README.md         → context for the Perchance AI agent
#   src/test-prompt.txt   → the handoff prompt for each test round
#   src/rpg/build/        → the committed production bundle (rpg.js/css/chunks)
#   src/rpg/src/          → readable TypeScript so the agent can navigate the code
#
# Everything else (configs, CI, guides, specs, graphify) stays out — the
# Perchance agent's context is small and focused.
#
# Usage:  ./scripts/ship-perchance.sh [--push]
#   --push  also push the branch to origin (default: build + commit locally only)
#
# Requires: bash 4+, git, pnpm (for the build). Run from the repo root.

set -euo pipefail

PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    *) echo "usage: $0 [--push]" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="perchance"
WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/perchance-ship.XXXXXX")"

cleanup() {
  if git worktree list --porcelain | grep -q "^worktree ${WORKTREE}$"; then
    git worktree remove --force "$WORKTREE" 2>/dev/null || true
  fi
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

cd "$ROOT"

# 1. Fresh production build (the ship artifact).
echo "→ building production bundle..."
(cd rpg && pnpm build)

# 2. Mount the perchance branch as a worktree.
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "→ branch '$BRANCH' exists — resetting it to $ROOT's current state"
  git worktree add --force "$WORKTREE" "$BRANCH"
  git -C "$WORKTREE" rm -rf . --quiet
else
  echo "→ creating new branch '$BRANCH'"
  git worktree add --detach "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan "$BRANCH" --quiet
  git -C "$WORKTREE" rm -rf . --quiet 2>/dev/null || true
fi

# 3. Copy the upload set.
echo "→ copying upload set..."
mkdir -p "$WORKTREE/src/rpg"
cp index.html main.pjs "$WORKTREE/"
cp README.md "$WORKTREE/src/README.md"
cp test-prompt.txt "$WORKTREE/src/test-prompt.txt"
cp -R rpg/build "$WORKTREE/src/rpg/build"
cp -R rpg/src "$WORKTREE/src/rpg/src"
# The Vite-emitted build/index.html is not part of the Perchance upload set —
# the platform's *HTML* panel is driven by the root index.html instead.
rm -f "$WORKTREE/src/rpg/build/index.html"

# 4. Commit.
echo "→ committing..."
git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "  (no changes — branch is already up to date)"
else
  git -C "$WORKTREE" commit --quiet -m "ship(perchance): refresh platform upload set

Build: $(git rev-parse --short HEAD) ($(git log -1 --format=%s))
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

# 5. Push (optional).
if [ "$PUSH" = "1" ]; then
  echo "→ pushing '$BRANCH'..."
  git push origin "$BRANCH"
fi

echo "→ done. Branch '$BRANCH' now contains:"
git -C "$WORKTREE" ls-tree -r --name-only "$BRANCH" | sed 's/^/    /' | head -40
