#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/copytolive/chat-ai.git"
BASE_DIR="${CHAT_AI_LOCAL_DIR:-$HOME/CopyToLive/chat-ai-test}"
RUNTIME_DIR="$BASE_DIR/.auth/local-test"
WA_DIR="$RUNTIME_DIR/whatsapp"
HANDOFF_DIR="$RUNTIME_DIR/handoff-queue"
STATE_FILE="$RUNTIME_DIR/state.json"
KEY_FILE="$RUNTIME_DIR/handoff.key"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
MOCK_PID_FILE="$RUNTIME_DIR/mock-ai.pid"
PORT="${PORT:-3847}"
URL="http://127.0.0.1:${PORT}/wa-scanner/"

say() { printf '\n%s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "Git belum tersedia. Di macOS jalankan: xcode-select --install"
command -v node >/dev/null 2>&1 || fail "Node.js belum tersedia. Install Node.js 20+ terlebih dahulu (Homebrew: brew install node)."
command -v npm >/dev/null 2>&1 || fail "npm belum tersedia. Install Node.js 20+ terlebih dahulu."

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node.js terlalu lama ($(node -v)). Gunakan Node.js 20 atau lebih baru."
fi

mkdir -p "$(dirname "$BASE_DIR")"
if [[ ! -d "$BASE_DIR/.git" ]]; then
  say "[1/5] Download CopyToLive Chat AI..."
  git clone "$REPO_URL" "$BASE_DIR"
else
  say "[1/5] Update CopyToLive Chat AI..."
  git -C "$BASE_DIR" fetch origin main --quiet
  git -C "$BASE_DIR" checkout main --quiet
  git -C "$BASE_DIR" reset --hard origin/main --quiet
fi

cd "$BASE_DIR"
mkdir -p "$WA_DIR" "$HANDOFF_DIR"
chmod 700 "$RUNTIME_DIR" "$WA_DIR" "$HANDOFF_DIR" 2>/dev/null || true

say "[2/5] Install dependency..."
npm ci --ignore-scripts

if [[ ! -s "$KEY_FILE" ]]; then
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$KEY_FILE"
  chmod 600 "$KEY_FILE" 2>/dev/null || true
fi

# Stop stale local-test processes created by this launcher only.
for pidfile in "$APP_PID_FILE" "$MOCK_PID_FILE"; do
  if [[ -s "$pidfile" ]]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pidfile"
  fi
done

say "[3/5] Start test AI..."
nohup env MOCK_AI_PORT=9999 node scripts/mock-ai.mjs > "$RUNTIME_DIR/mock-ai.log" 2>&1 &
echo $! > "$MOCK_PID_FILE"

export NODE_ENV=development
export HOST=127.0.0.1
export PORT="$PORT"
export RELEASE_VERSION=local-wa-test
export AUTOMATION_ENABLED=true
export REQUIRE_MARKETING_FOR_READY=true
export REQUIRE_HANDOFF_FOR_READY=true

export WA_PROVIDER=baileys
export PRODUCTION_REQUIRE_CLOUD=false
export ALLOW_UNOFFICIAL_WA=true
export WA_AUTH_DIR="$WA_DIR"
export WA_REPLY_GROUPS=false
export WA_LOG_LEVEL=warn

export AI_ENABLED=true
export AI_BASE_URL=http://127.0.0.1:9999/v1
export AI_MODEL=local-test-agent
export AI_API_KEY=

export MARKETING_ENABLED=true
export MARKETING_REQUIRE_KNOWLEDGE=true
export MARKETING_AGENT_NAME="${MARKETING_AGENT_NAME:-CopyToLive AI}"
export MARKETING_AGENT_ROLE="${MARKETING_AGENT_ROLE:-conversation marketing assistant}"
export MARKETING_COMPANY_NAME="${MARKETING_COMPANY_NAME:-CopyToLive}"
export MARKETING_BUSINESS="${MARKETING_BUSINESS:-Local disposable WhatsApp test environment.}"
export MARKETING_VALUE_PROPOSITION="${MARKETING_VALUE_PROPOSITION:-Test automatic inbound WhatsApp conversation handling before production.}"
export MARKETING_PURPOSE="${MARKETING_PURPOSE:-Understand the inbound message and provide one concise useful next step.}"
export MARKETING_CTA="${MARKETING_CTA:-Continue the test conversation.}"
export MARKETING_LOCALE="${MARKETING_LOCALE:-id-ID}"
export KNOWLEDGE_FACTS="${KNOWLEDGE_FACTS:-This is a test environment. Do not invent prices, guarantees, availability, or legal claims.}"
export STATE_FILE="$STATE_FILE"

export HANDOFF_MODE=local
export HANDOFF_QUEUE_DIR="$HANDOFF_DIR"
export HANDOFF_QUEUE_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
export HANDOFF_REQUIRE_ENCRYPTED_QUEUE=false

export SCANNER_TOKEN=
export ADMIN_TOKEN=local-test-admin

say "[4/5] Start WhatsApp scanner..."
nohup node src/index.js > "$RUNTIME_DIR/app.log" 2>&1 &
echo $! > "$APP_PID_FILE"

for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    say "[5/5] READY — membuka QR scanner"
    printf '\n============================================================\n'
    printf ' CopyToLive WhatsApp TEST\n'
    printf ' UI: %s\n' "$URL"
    printf ' Session: %s\n' "$WA_DIR"
    printf ' Log: %s\n' "$RUNTIME_DIR/app.log"
    printf '============================================================\n\n'
    if command -v open >/dev/null 2>&1; then
      open "$URL" || true
    fi
    printf 'Scan dari HP: WhatsApp -> Linked devices -> Link a device\n'
    printf 'Lalu kirim pesan dari nomor WA test lain. Bot akan auto-reply.\n\n'
    exit 0
  fi
  sleep 1
done

printf '\nScanner gagal start. Log terakhir:\n' >&2
tail -n 100 "$RUNTIME_DIR/app.log" >&2 || true
exit 1
