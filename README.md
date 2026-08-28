# chat-ai

Public clean-room recovery of the legacy WhatsApp AI service that previously lived inside the OpenTrue monorepo, now extended with a staged conversation marketing agent.

## What this repository preserves

The verified legacy deployment exposed a WhatsApp scanner service behind `/wa-scanner/*` and an internal Node service on port `3847`. The old repository inventory also recorded a dedicated `backend/systemAutowa` directory. This repository separates that concern into a standalone public service without importing private Git history, secrets, WhatsApp sessions, browser profiles, chat logs, or user data.

> Recovery note: the original Mac working tree was not mounted in the cloud runtime used to create the clean-room baseline. The recovered service must not be represented as a byte-for-byte copy of the unavailable local source until a sanitized original tree is compared.

## Conversation marketing engine

The marketing layer uses a lightweight Node implementation inspired by the staged, context-aware sales-agent architecture popularized by [`filip-michalsky/SalesGPT`](https://github.com/filip-michalsky/SalesGPT). SalesGPT is MIT-licensed and focuses specifically on context-aware AI sales conversations. This repository does **not** embed its Python/LangChain stack; it implements an interoperable staged flow that fits the existing WhatsApp runtime.

The eight stages are:

1. Welcome
2. Qualification
3. Discovery
4. Value
5. Solution
6. Objection handling
7. Close / next step
8. End / human handoff

Each AI turn returns a stage, a 0-100 commercial-intent/fit score, a next action, optional human handoff, and the reply. Opt-out and explicit human-handoff requests are handled deterministically before the LLM is called.

### Safety and trust defaults

- Inbound-first; this repository does not contain a bulk-send endpoint.
- Never claims to be human; the prompt requires disclosure when asked.
- Explicit opt-out stops future automation for that in-memory session.
- Human handoff stops future automation for that in-memory session.
- No sensitive-trait inference for lead scoring.
- No fake urgency, manipulative scarcity, guilt, or repeated pressure.
- No invented pricing, guarantees, testimonials, discounts, availability, or product capabilities.
- Conversation marketing memory is RAM-only with TTL; it is not persisted to Git or a database by this service.

## Features

- WhatsApp Web connection with QR pairing.
- `GET /health` and protected `GET /status` runtime checks.
- Protected `GET /qr` returns the current QR for the scanner UI.
- Browser scanner + conversation marketing preview at `/`.
- `POST /marketing/preview` tests the same marketing brain without real WhatsApp traffic.
- Incoming text can use either a normal AI assistant or the staged marketing agent.
- OpenAI-compatible AI endpoint support, including compatible local gateways.
- Allowlist controls for JIDs and group replies.
- Session/auth material is explicitly ignored by Git.
- No contact scraping, stealth messaging, or bulk-send feature.

## Requirements

- Node.js 20+
- A WhatsApp account you are authorized to connect
- An OpenAI-compatible chat-completions endpoint when AI replies are enabled

## Quick start

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3847`.

### Enable conversation marketing

Configure at minimum:

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=your-model

MARKETING_ENABLED=true
MARKETING_COMPANY_NAME=Your Company
MARKETING_BUSINESS=Describe verified products, services, audience, and facts the agent may use.
MARKETING_VALUE_PROPOSITION=Describe the strongest verified value.
MARKETING_PURPOSE=Understand fit and help the prospect choose a useful next step.
MARKETING_CTA=Offer a demo or meeting when the prospect is ready.
```

Then open the browser UI and use **Conversation Marketing Preview**. When the flow is satisfactory, scan the WhatsApp QR. Incoming accepted messages will use the same marketing agent.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| GET | `/status` | WhatsApp + AI + marketing state |
| GET | `/qr` | Current pairing QR, if available |
| POST | `/marketing/preview` | Test a staged sales conversation without WhatsApp |
| POST | `/reconnect` | Recreate the WhatsApp socket |
| GET | `/` | Scanner, status, and marketing preview UI |

When this service is behind a reverse proxy, mount it under `/wa-scanner/*` and strip that prefix before forwarding, matching the verified legacy deployment contract.

## Public exposure

The safe default is `HOST=127.0.0.1`. If you bind to a non-loopback interface such as `0.0.0.0`, the process refuses to start unless `SCANNER_TOKEN` is configured. Protected scanner/status/preview requests must then provide the same token through `x-scanner-token`.

Do not expose `/qr` or `/marketing/preview` as anonymous public endpoints.

## Configuration

See `.env.example`. Important controls include:

- `PORT=3847`
- `HOST=127.0.0.1`
- `SCANNER_TOKEN`
- `ADMIN_TOKEN`
- `WA_AUTH_DIR`
- `WA_REPLY_GROUPS=false`
- `WA_ALLOWED_JIDS`
- `AI_ENABLED`
- `AI_BASE_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `MARKETING_ENABLED`
- `MARKETING_COMPANY_NAME`
- `MARKETING_BUSINESS`
- `MARKETING_VALUE_PROPOSITION`
- `MARKETING_PURPOSE`
- `MARKETING_CTA`
- `MARKETING_SESSION_TTL_MINUTES`

## Security rules

Never commit:

- `.env` or API keys
- WhatsApp auth/session material
- QR screenshots
- chat logs or contact exports
- cookies/browser profiles
- database dumps or user data

The repository intentionally starts from a new public history rather than mirroring the old private monorepo.

## Responsible use

This project uses an unofficial WhatsApp Web library. Use it only for accounts and conversations you are authorized to automate, and comply with WhatsApp's terms and applicable privacy/anti-spam rules. For business-critical production use, consider the official WhatsApp Business Platform/Cloud API.

## Upstream inspiration

- SalesGPT: https://github.com/filip-michalsky/SalesGPT — staged context-aware AI sales-agent architecture, MIT License.
- See `THIRD_PARTY_NOTICES.md` for attribution notes.

## Recovery / build status

- [x] Public standalone repository
- [x] Legacy port/prefix contract preserved
- [x] QR pairing + runtime status
- [x] OpenAI-compatible AI reply adapter
- [x] SalesGPT-inspired staged conversation marketing agent
- [x] Lead score + next action + objection/close stages
- [x] Deterministic opt-out + human handoff
- [x] Browser marketing preview
- [x] Public secret/session denylist
- [x] CI syntax, unit, and critical dependency audit
- [ ] Byte-for-byte comparison with the original `backend/systemAutowa` local directory (requires that local tree or a sanitized archive to be made accessible)
