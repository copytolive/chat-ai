# CopyToLive Chat AI

Public, launch-hardened WhatsApp AI conversation-marketing service. It preserves the verified legacy `/wa-scanner/*` / port `3847` contract while moving production traffic to the official WhatsApp Business Platform / Cloud API.

## Launch architecture

`WhatsApp Cloud API → signed webhook → dedupe/rate-limit → staged marketing agent → verified knowledge → AI primary/fallback → reply or human handoff`

Production defaults are fail-closed:

- `WA_PROVIDER=cloud` is required when `NODE_ENV=production` unless an explicit unofficial-provider override is set.
- `AUTOMATION_ENABLED=false` until an operator deliberately enables it.
- `/ready` returns 200 only when WhatsApp, AI, required marketing configuration, verified knowledge, and the automation switch are ready.
- Meta webhook POSTs require `X-Hub-Signature-256` validation with `WA_CLOUD_APP_SECRET`.
- Duplicate inbound message IDs are suppressed.
- Operator surfaces use `SCANNER_TOKEN`; mutation endpoints also require `ADMIN_TOKEN`.
- No bulk-send or contact-scraping endpoint exists.

## Conversation marketing

The lightweight Node marketing engine is inspired by the MIT-licensed SalesGPT staged sales architecture. Stages are welcome, qualification, discovery, value, solution, objection, close, and end/handoff.

Every AI turn carries stage, 0–100 lead score, next action, handoff flag, and reply. Product/company facts are grounded only in reviewed business context and `knowledge.json`/`KNOWLEDGE_FACTS`. Missing price, stock, discount, guarantee, delivery date, legal terms, or capability must not be invented.

### Durable safety state

Raw chat text is not written to the durable state file. The service persists only automation metadata such as stage, lead score, opt-out, handoff, pause reason, next action, and timestamps. Opt-out therefore survives restart. Human handoff suppresses the bot until an admin explicitly resumes the contact. Explicit `start`/`mulai lagi` can re-enable a previously opted-out conversation.

## Production setup

1. Copy `.env.example` to `.env` outside Git and fill real secrets.
2. Review `knowledge.example.json`, create `/data/knowledge.json`, and mount `/data` persistently.
3. Configure the Meta webhook URL: `https://<host>/webhooks/whatsapp`.
4. Configure an OpenAI-compatible primary model and preferably a fallback model.
5. Deploy with `docker compose up -d --build` behind HTTPS/reverse proxy.
6. Keep automation OFF, verify `/health`, then satisfy `/ready`.
7. Enable automation and run `npm run launch:doctor` from a protected operator host.
8. Perform controlled inbound tests for discovery, objection, opt-out, explicit re-opt-in, and human handoff.

See `RUNBOOK.md` for go-live and rollback steps and `SECURITY.md` for the security contract.

## Operator endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/ready` | Fail-closed launch readiness |
| GET | `/status` | Protected runtime/AI/marketing/metrics state |
| GET | `/metrics` | Protected operational counters and p50/p95 latency |
| GET/POST | `/webhooks/whatsapp` | Meta verification + signed inbound webhook |
| POST | `/marketing/preview` | Protected browser/API preview of the live marketing brain |
| POST | `/admin/automation` | Protected global kill switch |
| POST | `/admin/handoff/resume` | Protected human-takeover resume |
| POST | `/reconnect` | Protected provider reconnect |
| GET | `/qr` | Baileys development QR only; Cloud API does not use QR |

## Automated launch gates

GitHub Actions runs three independent jobs:

1. **test** — syntax/unit tests, a deterministic 1,000-case launch acceptance matrix, critical dependency audit, production-like local stack, Cloud webhook verification, preview API, and launch doctor.
2. **browser** — real headless Chromium loads the launch console, executes its JavaScript, submits a marketing-preview form, and must render `LAUNCH READY`, a preview reply, and `DISCOVERY · 42/100`; DOM + PNG are uploaded as evidence.
3. **docker** — builds the production container image.

## Recovery note

Drive evidence records the legacy `backend/systemAutowa` service and the `/wa-scanner/*` deployment route, but the original Mac working tree was not mounted into the cloud runtime used for this clean-room recovery. Do not claim byte-for-byte identity until a sanitized original tree is compared.

## Responsible use

Use only for accounts and conversations you are authorized to automate. Respect WhatsApp/Meta platform rules, privacy/anti-spam requirements, opt-out requests, and human takeover. Baileys is kept for authorized development compatibility; production is designed around the official Cloud API.

## Attribution

SalesGPT: `filip-michalsky/SalesGPT` — staged context-aware sales-agent architecture, MIT License. See `THIRD_PARTY_NOTICES.md`.
