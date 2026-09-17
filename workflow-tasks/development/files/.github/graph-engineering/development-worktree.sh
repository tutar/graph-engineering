#!/usr/bin/env bash
set -euo pipefail

interrupted_ref="refs/graph-engineering/interrupted/${TARGET_BRANCH}"
interrupted_stash_ref="refs/graph-engineering/interrupted-stash/${TARGET_BRANCH}"
legacy_interrupted_ref="refs/loop-engineering/interrupted/${TARGET_BRANCH}"
legacy_interrupted_stash_ref="refs/loop-engineering/interrupted-stash/${TARGET_BRANCH}"

migrate_legacy_ref() {
  local current="$1"
  local legacy="$2"
  if ! git show-ref --verify --quiet "${current}" && git show-ref --verify --quiet "${legacy}"; then
    git update-ref "${current}" "${legacy}"
    git update-ref -d "${legacy}"
  fi
}

case "${1:-}" in
  prepare)
    migrate_legacy_ref "${interrupted_ref}" "${legacy_interrupted_ref}"
    migrate_legacy_ref "${interrupted_stash_ref}" "${legacy_interrupted_stash_ref}"
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
    migrate_legacy_ref "${interrupted_ref}" "${legacy_interrupted_ref}"
    migrate_legacy_ref "${interrupted_stash_ref}" "${legacy_interrupted_stash_ref}"
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
