# chat-ai

Public clean-room recovery of the legacy WhatsApp AI service that previously lived inside the OpenTrue monorepo.

## What this repository preserves

The verified legacy deployment exposed a WhatsApp scanner service behind `/wa-scanner/*` and an internal Node service on port `3847`. The old repository inventory also recorded a dedicated `backend/systemAutowa` directory. This repository separates that concern into a standalone public service without importing private Git history, secrets, WhatsApp sessions, browser profiles, chat logs, or user data.

> Recovery note: the original Mac working tree is not mounted in the cloud runtime used to create this repository. The code here is a clean-room, runnable baseline reconstructed from the verified deployment/inventory contract. It must not be represented as a byte-for-byte copy of the unavailable local source.

## Features

- WhatsApp Web connection with QR pairing.
- `GET /health` and protected `GET /status` runtime checks.
- Protected `GET /qr` returns the current QR as a data URL for the scanner UI.
- Minimal scanner page at `/`.
- Incoming text messages can be answered by an OpenAI-compatible AI endpoint.
- Works with local OpenAI-compatible servers such as Ollama-compatible gateways when configured.
- Allowlist controls for JIDs and group replies.
- Session data is stored outside source by default and is explicitly ignored by Git.
- No bulk-send, contact scraping, stealth, or spam features.
- Public status never exposes the WhatsApp account ID, auth directory, AI endpoint URL, API key, or raw error detail.

## Requirements

- Node.js 20+
- A WhatsApp account you are authorized to connect
- Optional: an OpenAI-compatible chat-completions endpoint

## Quick start

```bash
cp .env.example .env
npm install
npm start
```

The safe default listens only on `127.0.0.1:3847`. Open `http://127.0.0.1:3847`, scan the QR code, then send a normal text message to the connected WhatsApp account.

For local AI, point `AI_BASE_URL` at an OpenAI-compatible local endpoint and set `AI_MODEL`. `AI_API_KEY` may be left blank only when your local endpoint does not require one.

## Public / reverse-proxy deployment

Do **not** expose an unprotected WhatsApp QR scanner to the internet.

- Keep `HOST=127.0.0.1` when Caddy/Nginx runs on the same host.
- If you intentionally bind a non-loopback interface, `SCANNER_TOKEN` is mandatory and the service refuses to start without it.
- The UI asks for `SCANNER_TOKEN` only when the protected API returns `401`; the value is kept in browser `sessionStorage`.
- Put HTTPS and, ideally, an additional identity/auth layer in front of `/wa-scanner/*`.
- Keep `ADMIN_TOKEN` separate; if blank, `POST /reconnect` is disabled.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Non-sensitive process health |
| GET | `/status` | WhatsApp + AI state; protected when `SCANNER_TOKEN` is set |
| GET | `/qr` | Current pairing QR; protected when `SCANNER_TOKEN` is set |
| POST | `/reconnect` | Manual reconnect; requires scanner + admin tokens |
| GET | `/` | Scanner/status UI |

When this service is behind a reverse proxy, mount it under `/wa-scanner/*` and strip that prefix before forwarding, matching the verified legacy deployment contract.

## Configuration

See `.env.example`. Important controls:

- `PORT=3847`
- `HOST=127.0.0.1`
- `SCANNER_TOKEN` — mandatory when binding a non-loopback interface.
- `ADMIN_TOKEN` — optional; enables the manual reconnect endpoint.
- `WA_AUTH_DIR` — keep this outside the repository in production.
- `WA_REPLY_GROUPS=false` — groups are ignored by default.
- `WA_ALLOWED_JIDS` — optional comma-separated allowlist.
- `AI_ENABLED=true|false`
- `AI_BASE_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `SYSTEM_PROMPT`

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

## Recovery status

- [x] Public standalone repository
- [x] Legacy port/prefix contract preserved
- [x] QR pairing + protected runtime status
- [x] AI reply adapter
- [x] Public secret/session denylist
- [x] CI syntax/unit/security gate
- [ ] Byte-for-byte comparison with the original `backend/systemAutowa` local directory (requires that local tree or a sanitized archive to be made accessible)
