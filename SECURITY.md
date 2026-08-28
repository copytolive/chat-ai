# Security policy

## Production rules

- Prefer `WA_PROVIDER=cloud` for business-critical production. QR scan mode uses Baileys/WhatsApp Web and must be enabled explicitly with `PRODUCTION_REQUIRE_CLOUD=false` and `ALLOW_UNOFFICIAL_WA=true`.
- Keep `.env*`, WhatsApp tokens, App Secret, API keys, queue encryption keys, linked-device session material, QR screenshots, contact exports and chat logs out of Git.
- Treat `/data/wa-auth` as a credential store. Anyone who obtains a valid linked-device session may be able to act as that WhatsApp account until the session is revoked.
- Expose the service through HTTPS and a reverse proxy. Keep operator routes protected by `SCANNER_TOKEN`; require a different `ADMIN_TOKEN` for mutations and inbox access.
- Persist `/data` on durable encrypted storage and back it up with restricted access.
- Durable suppression state hashes contact identifiers with SHA-256 before writing them to disk.
- Production Cloud mode requires `WA_QUEUE_ENCRYPTION_KEY` by default. Pending webhook queue payloads are AES-256-GCM encrypted and file permissions are restricted.
- Human takeover uses an encrypted durable queue. `HANDOFF_MODE=local` keeps items in the protected built-in inbox until acknowledged; `HANDOFF_MODE=webhook` signs outbound payloads with HMAC.
- Verify Meta webhook signatures (`X-Hub-Signature-256`) against the exact raw request body with `WA_CLOUD_APP_SECRET` before queueing any event.
- ACK a Meta webhook only after each accepted inbound message has been durably queued. Message IDs are used for persistent idempotency so provider retries do not create duplicate replies.
- In QR scan mode, do not expose the QR console publicly without `SCANNER_TOKEN`; a pairing QR is sensitive while valid.
- Use `WA_REPLY_GROUPS=false` unless group automation has been explicitly reviewed and authorized.
- Keep the global kill switch available and use it immediately if replies are unsafe or a provider is degraded.
- Rotate tokens/keys after suspected exposure. If a scan session is exposed, revoke the linked device from WhatsApp and pair again.

## Data minimization

The service does not persist long-term raw conversation history as marketing memory. Durable suppression/lead state stores only hashed contact keys plus stage, lead score, opt-out, handoff, pause reason and timestamps.

Two short-lived operational stores can contain raw routing/message data because they must complete delivery:

- the Cloud inbound queue while a message is waiting to be processed;
- the human-handoff inbox while an operator action is pending.

Both are designed for durable encrypted storage in production. Operators should acknowledge/remove completed handoff items and apply retention/privacy policies appropriate to their jurisdiction.

## QR scan risk boundary

Scan mode is intentionally supported because it matches the one-scan operational workflow, but Baileys is not an official WhatsApp Business Platform SDK. WhatsApp protocol/account-policy changes can break a session or require re-pairing. The official Cloud API path should be used where vendor support, account stability and policy compliance are critical.

## Reporting

Do not post secrets, QR images, session files, production contact data or chat content in a public GitHub issue. Use a private maintainer channel for security reports.
