# GitHub-only WhatsApp public test scanner

This mode is intentionally optimized for a disposable/test WhatsApp number: GitHub Pages is public, the Codespaces scanner port is made public automatically, the QR can be scanned immediately, and automation starts after pairing.

## 1. Open the scanner

Open:

`https://copytolive.github.io/chat-ai/`

Click **START WHATSAPP SCANNER**.

The Codespace dev container installs locked dependencies, starts the WhatsApp scanner, forwards port `3847`, changes that port to **public test visibility**, verifies remote `/health`, and opens `/wa-scanner/` directly.

Scanner URL format:

`https://<codespace-name>-3847.<codespaces-forwarding-domain>/wa-scanner/`

For GitHub-hosted Codespaces this normally uses `*.app.github.dev`.

## 2. Expected pre-scan state

Before pairing, the scanner should show:

- QR code
- `NOT READY`
- `AUTO-RUN ENABLED`
- `SESSION PERSISTENT`

Run this from the Codespace terminal for a full public test check:

`bash scripts/public-test-doctor.sh`

Expected doctor result before scan:

- Local health: PASS
- Public health: PASS
- Provider: PASS · Baileys
- Automation: PASS · enabled
- QR: PASS · ready to scan
- STATE: WAITING_FOR_SCAN

If automatic public visibility fails, run once:

`gh codespace ports visibility 3847:public -c "$CODESPACE_NAME"`

Then rerun the doctor.

## 3. Scan and test

On the disposable/test WhatsApp phone:

**WhatsApp -> Linked devices -> Link a device**

Scan the QR shown by the public scanner UI. After pairing, the UI should switch to:

- `CONNECTED`
- `Connected · Auto-run`
- `LAUNCH READY`

Then send a message to the paired account from another test number. The service handles inbound messages automatically and sends the generated reply back to the sender.

If no real AI environment is configured in the Codespace, the launcher uses the repository's local mock AI so the receive -> agent -> reply path can be tested immediately.

## 4. Public test boundaries

For this test mode:

- GitHub Pages is public.
- Codespaces port `3847` is intentionally public.
- `/status`, `/health`, `/ready`, `/qr`, and the scanner UI are readable without a scanner token.
- Admin mutation endpoints remain disabled, so a public visitor cannot toggle automation or issue admin mutations.
- Linked-device credentials remain only under `.auth/codespace/whatsapp` inside the Codespace and are ignored by Git.
- QR/session files are never committed to the public repository or backed up to Drive.

GitHub may revert a public forwarded port to private after a Codespace restart. `scripts/codespace-start.sh` therefore reapplies public visibility on each start/attach.

## 5. Ready-to-use acceptance

The GitHub-side automated gates validate:

- devcontainer configuration
- GitHub CLI availability contract
- public-port command contract
- deterministic `*.app.github.dev` scanner URL
- direct browser open behavior
- 1,000-case conversation acceptance
- Chromium QR before scan
- Chromium connected/auto-run after simulated scan
- Docker build and published-port smoke test

The only final acceptance that cannot be performed by CI is the physical WhatsApp action: scan the QR from the test phone and send a real inbound test message.
