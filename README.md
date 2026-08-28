# CopyToLive Chat AI

[![Open WhatsApp Scanner in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/copytolive/chat-ai?quickstart=1)

Public operator UI: **https://copytolive.github.io/chat-ai/**

## Fastest test path — public WA test mode

For a disposable/test WhatsApp account, open the public GitHub Pages UI and click **START WHATSAPP SCANNER**.

The Codespace is configured to:

1. install locked dependencies,
2. start the Baileys WhatsApp scanner,
3. forward port `3847`,
4. make port `3847` public for the test session,
5. verify the public `/health` endpoint,
6. open `/wa-scanner/` automatically,
7. show a QR before pairing,
8. start automatic inbound handling after pairing,
9. reconnect automatically after non-logout disconnects.

Run `bash scripts/public-test-doctor.sh` inside the Codespace to verify the public test runtime. See `GITHUB_SCAN.md` and `PUBLIC_TEST.md` for the exact scan flow.

Public test mode intentionally leaves the scanner UI/QR/status readable through the public Codespaces forwarded port. Use only a test account. Admin mutation endpoints are disabled in this profile. Linked-device session files stay inside `.auth/codespace/whatsapp` and are ignored by Git.

## Launch architecture

Two WhatsApp paths are supported:

- **QR SCAN MODE / PUBLIC TEST MODE** — scan once, persist the linked-device session, listen for inbound messages, run the marketing/AI pipeline, reply automatically, and reconnect after interruption.
- **CLOUD MODE** — official WhatsApp Business Platform / Cloud API with signed webhooks, durable queueing, idempotency, and production launch gates.

Scan pipeline:

`QR scan → persistent WhatsApp session → automatic inbound listener → staged marketing agent → knowledge grounding → AI primary/fallback → reply or human handoff`

Cloud pipeline:

`WhatsApp Cloud API → signed webhook → durable queue/idempotency → staged marketing agent → knowledge grounding → AI primary/fallback → reply or human handoff`

## Public test acceptance

Before scan, the scanner must show:

- QR code
- `NOT READY`
- `AUTO-RUN ENABLED`
- `SESSION PERSISTENT`

After scan, it must show:

- `CONNECTED`
- `Connected · Auto-run`
- `LAUNCH READY`

Then send a message from another test number. The service must receive the inbound message and send the generated reply automatically.

If no external AI variables are configured in the Codespace, the launcher uses the repository's local mock AI so the WhatsApp receive → agent → reply path can be tested immediately.

## Persistence and restart

Codespaces linked-device credentials are stored under `.auth/codespace/whatsapp`. Stop/resume of the same Codespace reuses the saved session. Deleting the Codespace removes that test runtime and requires pairing again.

GitHub can revert a public forwarded port to private after a Codespace restart. `scripts/codespace-start.sh` therefore reapplies `3847:public` on every start/attach when `PUBLIC_TEST_MODE=true`.

## Docker scan mode

For an always-on server instead of an interactive Codespace:

1. Copy `.env.scan.example` to `.env.scan`.
2. Configure AI/company knowledge as needed.
3. Run `docker compose -f docker-compose.scan.yml up -d --build`.
4. Open `/wa-scanner/`.
5. Scan once.
6. Confirm `CONNECTED · Auto-run` and `/ready` HTTP 200.

The Docker profile persists the session under `/data/wa-auth`.

## Official Cloud API mode

For business-critical production, the official WhatsApp Cloud API path remains preferred.

1. Copy `.env.example` to `.env` outside Git.
2. Configure the real Meta phone/access/webhook values.
3. Configure reviewed knowledge and an AI endpoint/model.
4. Deploy behind HTTPS.
5. Verify `/health` and `/ready`.
6. Enable automation and perform controlled inbound tests.

## Conversation marketing

The marketing engine uses staged conversation states: welcome, qualification, discovery, value, solution, objection, close, and end/handoff.

Each AI turn carries stage, lead score, next action, handoff state, and reply. Product/company claims are grounded in configured knowledge. Missing price, stock, discount, guarantee, delivery date, legal terms, or unsupported capabilities must not be invented.

Opt-out and human takeover are deterministic and persisted. Human handoff pauses the bot until resumed.

## Main endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/ready` | Launch readiness |
| GET | `/status` | Runtime/AI/marketing/queue state |
| GET | `/metrics` | Operational counters |
| GET | `/qr` | Current scan-mode QR |
| POST | `/marketing/preview` | Marketing agent preview |
| GET/POST | `/webhooks/whatsapp` | Cloud API verification/inbound webhook |
| POST | `/admin/automation` | Global automation switch when admin access is enabled |
| POST | `/reconnect` | Provider reconnect when admin access is enabled |

In the public Codespaces test profile, scanner/status/QR reads are intentionally public and admin mutation endpoints are disabled.

## Automated gates

GitHub Actions validates:

- locked `npm ci` install,
- syntax/unit tests,
- deterministic 1,000-case conversation acceptance,
- opt-out/handoff persistence,
- Cloud webhook/security contracts,
- Codespaces URL/direct-open contract,
- public test visibility contract,
- public test doctor contract,
- Chromium Cloud console,
- Chromium QR before pairing,
- Chromium connected/auto-run after simulated pairing,
- Docker/Compose build and published-port smoke test.

CI cannot physically operate a WhatsApp phone. The final real acceptance is therefore: scan with the disposable test phone and send a real inbound message from a second test number.

## Notes

QR scan mode uses the unofficial Baileys/WhatsApp Web protocol and can be affected by WhatsApp platform changes. Use it for authorized testing/compatibility. Use the official Cloud API when long-term account stability and platform support are required.

No bulk-send/contact-scraping endpoint is included.

See:

- `GITHUB_SCAN.md` — public Codespaces scan/test steps
- `PUBLIC_TEST.md` — quick public test checklist
- `RUNBOOK.md` — go-live and rollback operations
- `SECURITY.md` — security model
- `THIRD_PARTY_NOTICES.md` — attribution

## Responsible use

Use only accounts and conversations you are authorized to automate. Respect opt-out requests, privacy requirements, and WhatsApp/Meta platform rules.
