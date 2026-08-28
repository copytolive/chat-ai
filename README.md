# CopyToLive Chat AI

Public, launch-hardened WhatsApp AI conversation-marketing service. It preserves the verified legacy `/wa-scanner/*` / port `3847` behavior and supports two launch paths:

- **QR SCAN MODE** — open the console, scan once from an authorized WhatsApp account, persist the session under `/data/wa-auth`, then process/reply automatically and reconnect after restart.
- **CLOUD MODE** — official WhatsApp Business Platform / Cloud API with signed webhooks, encrypted durable queueing and persistent idempotency.

## Launch architecture

Scan mode:

`QR scan → persistent WhatsApp session → automatic inbound listener → staged marketing agent → verified knowledge → AI primary/fallback → reply or encrypted human inbox`

Cloud mode:

`WhatsApp Cloud API → signed webhook → encrypted durable queue/idempotency → staged marketing agent → verified knowledge → AI primary/fallback → reply or human handoff`

The runtime is fail-closed. `/ready` returns HTTP 200 only when the active WhatsApp provider, AI, required marketing/knowledge configuration, human handoff path and automation switch are ready. Before a QR scan is completed, scan mode intentionally returns NOT READY. After pairing, it becomes CONNECTED and automatic message handling starts without another operator action.

## QR scan launch — one scan, then auto-run

1. Copy `.env.scan.example` to `.env.scan` and fill the scanner/admin secrets, AI model, company facts, reviewed knowledge path and a 32-byte handoff encryption key.
2. Run `docker compose -f docker-compose.scan.yml up -d --build`.
3. Open the protected launch console through your HTTPS reverse proxy.
4. The service starts the WhatsApp scanner automatically and renders the QR.
5. In WhatsApp open **Linked devices → Link a device** and scan it once.
6. The session is written to the persistent `/data/wa-auth` volume. The console must change to `CONNECTED · Auto-run` and `/ready` must return 200.
7. From then on, accepted inbound messages are handled automatically. Docker restarts the service and Baileys reconnects using the saved session after process/host restart.

This QR mode uses the unofficial Baileys WhatsApp Web protocol and therefore carries platform-stability/account-policy risk. The official Cloud API remains the preferred path for business-critical production.

## Official Cloud API launch

1. Copy `.env.example` to `.env` outside Git and fill real secrets.
2. Review `knowledge.example.json`, create `/data/knowledge.json`, and mount `/data` persistently.
3. Generate a dedicated 32-byte `WA_QUEUE_ENCRYPTION_KEY` and keep it in the deployment secret manager.
4. Configure the Meta webhook URL `https://<host>/webhooks/whatsapp`.
5. Configure an OpenAI-compatible primary model and preferably a fallback model.
6. Deploy with `docker compose up -d --build` behind HTTPS/reverse proxy.
7. Keep automation OFF, verify `/health`, then satisfy `/ready`.
8. Enable automation and run `npm run launch:doctor` from a protected operator host.

## Conversation marketing

The lightweight Node marketing engine is inspired by the MIT-licensed SalesGPT staged sales architecture. Stages are welcome, qualification, discovery, value, solution, objection, close and end/handoff.

Every AI turn carries stage, 0–100 lead score, next action, handoff flag and reply. Product/company claims are grounded only in reviewed business context and `knowledge.json`/`KNOWLEDGE_FACTS`. Missing price, stock, discount, guarantee, delivery date, legal terms or capability must not be invented.

Opt-out and human takeover are deterministic. Opt-out survives restart. Human handoff pauses the bot until an admin explicitly resumes the contact. Explicit `start`/`mulai lagi` can re-enable a previously opted-out conversation.

## Durable privacy and delivery

- Durable suppression/lead state hashes contact identifiers with SHA-256 and does not persist raw conversation history.
- Cloud inbound work is queued before webhook ACK, AES-256-GCM encrypted in production and protected by a persistent processed-message ledger against duplicate replies.
- Human takeover defaults to `HANDOFF_MODE=local`: an encrypted built-in inbox that does not require an external CRM. Operators can list and acknowledge those items through protected admin endpoints.
- `HANDOFF_MODE=webhook` remains available for a signed Chatwoot/CRM/operator bridge.
- No bulk-send or contact-scraping endpoint exists.

## Operator endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/ready` | Fail-closed launch readiness |
| GET | `/status` | Protected runtime/AI/marketing/queue state |
| GET | `/metrics` | Protected operational counters and p50/p95 latency |
| GET/POST | `/webhooks/whatsapp` | Meta verification + signed Cloud inbound webhook |
| GET | `/qr` | Current QR for authorized scan mode |
| POST | `/marketing/preview` | Protected preview of the live marketing brain |
| GET | `/admin/handoffs` | Protected encrypted local human inbox |
| POST | `/admin/handoffs/:id/ack` | Mark a local handoff item handled |
| POST | `/admin/handoff/resume` | Resume AI after human takeover |
| POST | `/admin/automation` | Global automation kill switch |
| POST | `/reconnect` | Provider reconnect |

## Automated launch gates

Dependencies are committed with `package-lock.json` and CI installs them using `npm ci`.

GitHub Actions runs three independent jobs:

1. **test** — syntax/unit tests, deterministic 1,000-case conversation matrix, scan→connected→automatic-reply acceptance, persistent opt-out/handoff, hashed-at-rest state, encrypted local inbox, encrypted Cloud queue/idempotency, critical dependency audit, production-like Cloud stack and launch doctor.
2. **browser** — real headless Chromium validates the Cloud console, then validates scan mode twice: before pairing it must display a real QR and `NOT READY`; after simulated pairing it must display `CONNECTED`, `AUTO-RUN ENABLED`, persistent `/data/wa-auth` and `LAUNCH READY`. DOM + PNG evidence are uploaded.
3. **docker** — builds the production container image.

See `RUNBOOK.md` for go-live/rollback operations and `SECURITY.md` for the security contract.

## Recovery note

Drive evidence records the legacy `backend/systemAutowa` service and `/wa-scanner/*` deployment route, but the original Mac working tree was not mounted into the cloud runtime used for this clean-room recovery. Do not claim byte-for-byte identity until a sanitized original tree is compared.

## Responsible use

Use only for accounts and conversations you are authorized to automate. Respect WhatsApp/Meta platform rules, privacy/anti-spam requirements, opt-out requests and human takeover. Baileys scan mode is provided for authorized compatibility; use the official Cloud API when account stability and platform support are critical.

## Attribution

SalesGPT: `filip-michalsky/SalesGPT` — staged context-aware sales-agent architecture, MIT License. See `THIRD_PARTY_NOTICES.md`.
