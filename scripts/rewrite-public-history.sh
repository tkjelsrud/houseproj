#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "No commits found yet. There is no history to rewrite."
  exit 0
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is required. Install it first:"
  echo "  brew install git-filter-repo"
  exit 1
fi

echo "This rewrites local git history to remove known sensitive utility files."
echo "Review the script before running it against any remote."

git filter-repo \
  --invert-paths \
  --path import.html \
  --path fix-dates.html \
  --force

echo "History rewrite completed."
echo "Next steps:"
echo "  1. Review the rewritten history with 'git log --stat'."
echo "  2. Search for sensitive strings before publishing."
echo "  3. Force-push only after you are satisfied with the result."
