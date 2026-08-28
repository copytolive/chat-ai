#!/usr/bin/env bash
set -euo pipefail
BASE_DIR="${CHAT_AI_LOCAL_DIR:-$HOME/CopyToLive/chat-ai-test}"
RUNTIME_DIR="$BASE_DIR/.auth/local-test"
for name in app mock-ai; do
  pidfile="$RUNTIME_DIR/$name.pid"
  if [[ -s "$pidfile" ]]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "Stopped $name ($pid)"
    fi
    rm -f "$pidfile"
  fi
done
echo "CopyToLive local WhatsApp test stopped. Session tetap tersimpan di $RUNTIME_DIR/whatsapp"
