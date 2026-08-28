#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "PUBLIC TEST DOCTOR: FAIL - CODESPACE_NAME is empty" >&2
  exit 1
fi

BASE_URL="$(bash scripts/codespace-url.sh 3847 /)"
SCANNER_URL="$(bash scripts/codespace-url.sh 3847 /wa-scanner/)"
HEALTH_URL="$(bash scripts/codespace-url.sh 3847 /health)"
STATUS_URL="$(bash scripts/codespace-url.sh 3847 /status)"
READY_URL="$(bash scripts/codespace-url.sh 3847 /ready)"
QR_URL="$(bash scripts/codespace-url.sh 3847 /qr)"

printf 'PUBLIC TEST DOCTOR\n'
printf 'Codespace: %s\n' "$CODESPACE_NAME"
printf 'Scanner:   %s\n' "$SCANNER_URL"

if ! curl -fsS http://127.0.0.1:3847/health >/dev/null; then
  echo "Local health: FAIL" >&2
  exit 1
fi
echo "Local health: PASS"

PUBLIC_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
if [[ "$PUBLIC_CODE" != "200" ]]; then
  echo "Public health: FAIL (HTTP $PUBLIC_CODE)" >&2
  echo "Run: gh codespace ports visibility 3847:public -c $CODESPACE_NAME" >&2
  exit 1
fi
echo "Public health: PASS"

STATUS_JSON="$(curl -fsS "$STATUS_URL")"
printf '%s' "$STATUS_JSON" | grep -q '"provider":"baileys"' || { echo "Provider: FAIL" >&2; exit 1; }
printf '%s' "$STATUS_JSON" | grep -q '"enabled":true' || { echo "Automation: FAIL" >&2; exit 1; }
echo "Provider: PASS · Baileys"
echo "Automation: PASS · enabled"

if curl -fsS "$QR_URL" >/tmp/chat-ai-public-qr.json 2>/dev/null; then
  grep -q 'data:image/png;base64' /tmp/chat-ai-public-qr.json || { echo "QR: FAIL" >&2; exit 1; }
  echo "QR: PASS · ready to scan"
  echo "STATE: WAITING_FOR_SCAN"
  echo "OPEN: $SCANNER_URL"
  exit 0
fi

READY_CODE="$(curl -sS -o /tmp/chat-ai-public-ready.json -w '%{http_code}' "$READY_URL" 2>/dev/null || true)"
if [[ "$READY_CODE" == "200" ]] && grep -q '"ok":true' /tmp/chat-ai-public-ready.json; then
  echo "QR: not needed · account already paired"
  echo "READY: PASS"
  echo "STATE: CONNECTED_AUTO_RUN"
  echo "OPEN: $SCANNER_URL"
  exit 0
fi

echo "QR/READY: FAIL - scanner is public but neither QR-ready nor connected" >&2
echo "Inspect: $SCANNER_URL" >&2
exit 1
