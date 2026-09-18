#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  prepare)
    if git ls-remote --exit-code origin "refs/heads/${TARGET_BRANCH}" >/dev/null 2>&1; then
      git fetch origin "${TARGET_BRANCH}"
      git switch --create "${TARGET_BRANCH}" --track "origin/${TARGET_BRANCH}"
    else
      git switch --create "${TARGET_BRANCH}"
    fi
    ;;
  *)
    echo "usage: coding-task-repository.sh prepare" >&2
    exit 2
    ;;
esac
