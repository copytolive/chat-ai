#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3847}"
PATH_SUFFIX="${2:-/wa-scanner/}"

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  printf 'https://%s-%s.%s%s\n' "$CODESPACE_NAME" "$PORT" "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" "$PATH_SUFFIX"
  exit 0
fi

printf 'http://127.0.0.1:%s%s\n' "$PORT" "$PATH_SUFFIX"
