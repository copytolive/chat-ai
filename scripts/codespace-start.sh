#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUNTIME_DIR="$ROOT/.auth/codespace"
WA_DIR="$RUNTIME_DIR/whatsapp"
HANDOFF_DIR="$RUNTIME_DIR/handoff-queue"
STATE_FILE="$RUNTIME_DIR/state.json"
KEY_FILE="$RUNTIME_DIR/handoff.key"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
MOCK_PID_FILE="$RUNTIME_DIR/mock-ai.pid"

mkdir -p "$WA_DIR" "$HANDOFF_DIR"
chmod 700 "$RUNTIME_DIR" "$WA_DIR" "$HANDOFF_DIR" 2>/dev/null || true

if [[ ! -s "$KEY_FILE" ]]; then
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi

if curl -fsS http://127.0.0.1:3847/health >/dev/null 2>&1; then
  echo
  echo "CopyToLive WhatsApp scanner is already running."
  echo "Open: http://127.0.0.1:3847/wa-scanner/"
  exit 0
fi

if [[ -z "${AI_BASE_URL:-}" || -z "${AI_MODEL:-}" ]]; then
  if [[ -s "$MOCK_PID_FILE" ]] && kill -0 "$(cat "$MOCK_PID_FILE")" 2>/dev/null; then
    :
  else
    nohup env MOCK_AI_PORT=9999 node scripts/mock-ai.mjs > "$RUNTIME_DIR/mock-ai.log" 2>&1 &
    echo $! > "$MOCK_PID_FILE"
  fi
  export AI_ENABLED=true
  export AI_BASE_URL=http://127.0.0.1:9999/v1
  export AI_MODEL=codespaces-test-agent
  export AI_API_KEY=
else
  export AI_ENABLED="${AI_ENABLED:-true}"
fi

export NODE_ENV=development
export HOST=127.0.0.1
export PORT=3847
export RELEASE_VERSION=codespaces-scan
export AUTOMATION_ENABLED=true
export REQUIRE_MARKETING_FOR_READY=true
export REQUIRE_HANDOFF_FOR_READY=true

export WA_PROVIDER=baileys
export PRODUCTION_REQUIRE_CLOUD=false
export ALLOW_UNOFFICIAL_WA=true
export WA_AUTH_DIR="$WA_DIR"
export WA_REPLY_GROUPS=false
export WA_LOG_LEVEL=warn

export MARKETING_ENABLED=true
export MARKETING_REQUIRE_KNOWLEDGE=true
export MARKETING_AGENT_NAME="${MARKETING_AGENT_NAME:-CopyToLive AI}"
export MARKETING_AGENT_ROLE="${MARKETING_AGENT_ROLE:-conversation marketing assistant}"
export MARKETING_COMPANY_NAME="${MARKETING_COMPANY_NAME:-CopyToLive}"
export MARKETING_BUSINESS="${MARKETING_BUSINESS:-Authorized GitHub Codespaces WhatsApp scanner end-to-end test environment.}"
export MARKETING_VALUE_PROPOSITION="${MARKETING_VALUE_PROPOSITION:-Test automatic inbound WhatsApp conversation handling safely before production cutover.}"
export MARKETING_PURPOSE="${MARKETING_PURPOSE:-Understand the inbound message and provide one concise useful next step.}"
export MARKETING_CTA="${MARKETING_CTA:-Continue the test conversation or ask for a human operator.}"
export MARKETING_LOCALE="${MARKETING_LOCALE:-id-ID}"
export KNOWLEDGE_FACTS="${KNOWLEDGE_FACTS:-This environment is an authorized scanner test. Do not invent product, price, performance, availability, or legal claims.}"
export STATE_FILE="$STATE_FILE"

export HANDOFF_MODE=local
export HANDOFF_QUEUE_DIR="$HANDOFF_DIR"
export HANDOFF_QUEUE_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
export HANDOFF_REQUIRE_ENCRYPTED_QUEUE=false

export SCANNER_TOKEN="${SCANNER_TOKEN:-}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-codespaces-local-admin-not-for-public-port}"

nohup node src/index.js > "$RUNTIME_DIR/app.log" 2>&1 &
echo $! > "$APP_PID_FILE"

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3847/health >/dev/null 2>&1; then
    echo
    echo "============================================================"
    echo " CopyToLive WhatsApp Scanner is running in GitHub Codespaces"
    echo "============================================================"
    echo "Open: http://127.0.0.1:3847/wa-scanner/"
    echo "Then scan: WhatsApp -> Linked devices -> Link a device"
    echo "The forwarded Codespaces port should remain PRIVATE."
    echo "WhatsApp session: $WA_DIR"
    echo "Logs: $RUNTIME_DIR/app.log"
    echo "============================================================"
    exit 0
  fi
  sleep 1
done

echo "Scanner failed to start. Last log lines:" >&2
tail -n 80 "$RUNTIME_DIR/app.log" >&2 || true
exit 1
