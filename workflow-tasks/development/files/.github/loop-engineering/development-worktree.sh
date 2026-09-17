#!/usr/bin/env bash
set -euo pipefail

interrupted_ref="refs/loop-engineering/interrupted/${TARGET_BRANCH}"
interrupted_stash_ref="refs/loop-engineering/interrupted-stash/${TARGET_BRANCH}"

case "${1:-}" in
  prepare)
    if git show-ref --verify --quiet "${interrupted_ref}"; then
      git switch --force-create "${TARGET_BRANCH}" "${interrupted_ref}"
      git rebase "${BASE_BRANCH}"
    elif git ls-remote --exit-code origin "refs/heads/${TARGET_BRANCH}" >/dev/null 2>&1; then
      git fetch origin "${TARGET_BRANCH}"
      git switch --create "${TARGET_BRANCH}" --track "origin/${TARGET_BRANCH}"
    else
      git switch --create "${TARGET_BRANCH}"
    fi
    ;;
  restore)
    if git show-ref --verify --quiet "${interrupted_stash_ref}"; then
      git stash apply --index "${interrupted_stash_ref}"
      git update-ref -d "${interrupted_stash_ref}"
    fi
    if git show-ref --verify --quiet "${interrupted_ref}"; then
      git update-ref -d "${interrupted_ref}"
    fi
    ;;
  *)
    echo "usage: development-worktree.sh prepare|restore" >&2
    exit 2
    ;;
esac
