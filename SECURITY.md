# Security policy

## Production rules

- Use `WA_PROVIDER=cloud` for production. Baileys is retained for authorized development only.
- Keep `.env`, WhatsApp tokens, App Secret, API keys, session material, QR screenshots, contact exports and chat logs out of Git.
- Expose the service through HTTPS and a reverse proxy. Keep operator routes protected by `SCANNER_TOKEN`; require `ADMIN_TOKEN` for mutations.
- Mount `/data` on durable encrypted storage and back it up. It contains suppression/handoff metadata, not raw chat content.
- Verify Meta webhook signatures (`X-Hub-Signature-256`) with `WA_CLOUD_APP_SECRET`.
- Keep `AUTOMATION_ENABLED=false` until `/ready` returns HTTP 200.
- Use the global kill switch immediately if replies are unsafe or a provider is degraded.
- Rotate tokens after any suspected exposure.

## Data minimization

The launch baseline does not persist raw conversation text. It persists only contact automation state such as stage, lead score, opt-out, handoff, pause reason and timestamps. Operators should apply retention and privacy policies appropriate to their jurisdiction.

## Reporting

Do not post secrets or personal data in a public GitHub issue. Use a private maintainer channel for security reports.
