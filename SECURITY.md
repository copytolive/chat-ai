# Security policy

## Production rules

- Use `WA_PROVIDER=cloud` for production. Baileys is retained for authorized development only.
- Keep `.env`, WhatsApp tokens, App Secret, API keys, queue encryption keys, session material, QR screenshots, contact exports and chat logs out of Git.
- Expose the service through HTTPS and a reverse proxy. Keep operator routes protected by `SCANNER_TOKEN`; require `ADMIN_TOKEN` for mutations.
- Persist `/data` on durable encrypted storage and back it up. It contains suppression/handoff metadata and pending webhook queue items, not long-term raw chat history.
- Durable suppression state hashes contact identifiers with SHA-256 before writing them to disk.
- Production Cloud mode requires `WA_QUEUE_ENCRYPTION_KEY` by default. Pending webhook queue payloads are encrypted with AES-256-GCM and file permissions are restricted.
- Verify Meta webhook signatures (`X-Hub-Signature-256`) against the exact raw request body with `WA_CLOUD_APP_SECRET` before queueing any event.
- ACK a Meta webhook only after each accepted inbound message has been durably queued. Message IDs are used for persistent idempotency so provider retries do not create duplicate replies.
- Keep `AUTOMATION_ENABLED=false` until `/ready` returns HTTP 200.
- Use the global kill switch immediately if replies are unsafe or a provider is degraded.
- Rotate tokens and queue encryption keys after any suspected exposure using an operator-controlled migration window.

## Data minimization

The launch baseline does not persist long-term raw conversation history. Durable suppression/lead state stores only hashed contact keys plus stage, lead score, opt-out, handoff, pause reason and timestamps. A pending Cloud webhook queue temporarily contains message routing data needed to finish delivery; production requires that queue to be encrypted at rest. Operators should apply retention and privacy policies appropriate to their jurisdiction.

## Reporting

Do not post secrets or personal data in a public GitHub issue. Use a private maintainer channel for security reports.
