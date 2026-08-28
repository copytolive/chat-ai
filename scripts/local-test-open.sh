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
MOCK_PORT="${MOCK_AI_PORT:-39999}"
URL="http://127.0.0.1:${PORT}/wa-scanner/"

say() { printf '\n%s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
stop_pidfile() {
  local pidfile="$1" pid=""
  [[ -s "$pidfile" ]] || return 0
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  fi
  rm -f "$pidfile"
}

command -v git >/dev/null 2>&1 || fail "Git belum tersedia. Jalankan: xcode-select --install"
command -v node >/dev/null 2>&1 || fail "Node.js belum tersedia. Install Node.js 20+ (brew install node)."
command -v npm >/dev/null 2>&1 || fail "npm belum tersedia. Install Node.js 20+."
command -v curl >/dev/null 2>&1 || fail "curl tidak tersedia."
command -v lsof >/dev/null 2>&1 || fail "lsof tidak tersedia."

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node.js terlalu lama ($(node -v)). Gunakan Node.js 20+."

# Stop only processes previously launched by this test launcher.
stop_pidfile "$APP_PID_FILE"
stop_pidfile "$MOCK_PID_FILE"

# Never mistake another local service for this scanner.
port_in_use "$PORT" && fail "Port $PORT sedang dipakai aplikasi lain. Tutup aplikasi itu lalu jalankan lagi."
port_in_use "$MOCK_PORT" && fail "Port $MOCK_PORT sedang dipakai aplikasi lain. Jalankan lagi dengan: MOCK_AI_PORT=40000 bash START_CHAT_AI.command"

mkdir -p "$(dirname "$BASE_DIR")"
if [[ ! -d "$BASE_DIR/.git" ]]; then
  say "[1/5] Download Chat AI..."
  git clone --depth 1 "$REPO_URL" "$BASE_DIR"
else
  say "[1/5] Update Chat AI..."
  git -C "$BASE_DIR" fetch origin main --depth 1 --quiet
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

say "[3/5] Start test AI..."
nohup env MOCK_AI_PORT="$MOCK_PORT" node scripts/mock-ai.mjs > "$RUNTIME_DIR/mock-ai.log" 2>&1 &
echo $! > "$MOCK_PID_FILE"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${MOCK_PORT}/health" >/dev/null 2>&1 && break
  kill -0 "$(cat "$MOCK_PID_FILE")" 2>/dev/null || { tail -n 50 "$RUNTIME_DIR/mock-ai.log" >&2 || true; fail "Test AI gagal start."; }
  sleep 0.2
done
kill -0 "$(cat "$MOCK_PID_FILE")" 2>/dev/null || fail "Test AI berhenti sebelum scanner start."

export NODE_ENV=development HOST=127.0.0.1 PORT="$PORT" RELEASE_VERSION=local-wa-test AUTOMATION_ENABLED=true
export REQUIRE_MARKETING_FOR_READY=true REQUIRE_HANDOFF_FOR_READY=true
export WA_PROVIDER=baileys PRODUCTION_REQUIRE_CLOUD=false ALLOW_UNOFFICIAL_WA=true WA_AUTH_DIR="$WA_DIR" WA_REPLY_GROUPS=false WA_LOG_LEVEL=warn
export AI_ENABLED=true AI_BASE_URL="http://127.0.0.1:${MOCK_PORT}/v1" AI_MODEL=local-test-agent AI_API_KEY=
export MARKETING_ENABLED=true MARKETING_REQUIRE_KNOWLEDGE=true
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
export HANDOFF_MODE=local HANDOFF_QUEUE_DIR="$HANDOFF_DIR" HANDOFF_QUEUE_ENCRYPTION_KEY="$(cat "$KEY_FILE")" HANDOFF_REQUIRE_ENCRYPTED_QUEUE=false
export SCANNER_TOKEN= ADMIN_TOKEN=local-test-admin

say "[4/5] Start WhatsApp scanner..."
nohup node src/index.js > "$RUNTIME_DIR/app.log" 2>&1 &
echo $! > "$APP_PID_FILE"

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    say "[5/5] READY"
    printf 'UI: %s\n' "$URL"
    command -v open >/dev/null 2>&1 && open "$URL" || true
    printf 'Scan: WhatsApp -> Linked devices -> Link a device\n'
    exit 0
  fi
  kill -0 "$(cat "$APP_PID_FILE")" 2>/dev/null || { tail -n 80 "$RUNTIME_DIR/app.log" >&2 || true; fail "Scanner gagal start."; }
  sleep 0.5
done

tail -n 80 "$RUNTIME_DIR/app.log" >&2 || true
fail "Scanner tidak ready dalam 30 detik."
