# GitHub-only WhatsApp scanner test

Use this when you want to scan and test the real WhatsApp linked-device flow without deploying a VPS first.

## 1. Open the repository in GitHub Codespaces

Open:

`https://codespaces.new/copytolive/chat-ai?quickstart=1`

Create or resume the Codespace. The dev container installs locked dependencies, starts the WhatsApp scanner, forwards port `3847`, computes the private forwarded scanner URL, and asks Codespaces/VS Code to open `/wa-scanner/` directly.

The scanner URL format is:

`https://<codespace-name>-3847.<codespaces-forwarding-domain>/wa-scanner/`

For current GitHub-hosted Codespaces this normally renders as an `*.app.github.dev` URL.

## 2. Scanner UI

The expected first visible application page is the WhatsApp scanner UI, not `GITHUB_SCAN.md`.

If your browser blocks the automatic new tab, use either fallback:

1. In the Codespace terminal, use the clickable `Scanner UI: https://.../wa-scanner/` URL printed by `scripts/codespace-start.sh`.
2. Or click **PORTS** -> **WhatsApp Scanner (3847)** -> **Open in Browser**, then append `/wa-scanner/` if needed.

Before pairing it should show:

- QR code
- `NOT READY`
- `AUTO-RUN ENABLED`
- `SESSION PERSISTENT`

Keep the forwarded port **Private**. GitHub Codespaces private forwarded ports require your GitHub authentication, which is enough for scanning a QR displayed on your desktop screen.

## 3. Scan and test

On the authorized WhatsApp phone:

**WhatsApp -> Linked devices -> Link a device**

Scan the QR shown by the Codespaces UI. After pairing the UI should switch to:

- `CONNECTED`
- `Connected · Auto-run`
- `LAUNCH READY`

Then send a WhatsApp message to the paired account from another authorized test number. The service handles inbound messages automatically. If no real AI environment variables are configured in the Codespace, the launcher uses the repository's local mock AI so the end-to-end WhatsApp receive -> agent -> reply path can be tested immediately.

## Persistence

Linked-device credentials are stored only inside the Codespace under `.auth/codespace/whatsapp`. They are ignored by Git and are never committed to the public repository. Stop/resume of the same Codespace reuses the saved session. Deleting the Codespace deletes that test runtime/session and requires pairing again.

## Production note

Codespaces is for interactive GitHub-hosted scanning and end-to-end testing, not a 24/7 production host. For continuous production, use the committed Docker scan profile on an always-on server or use the official WhatsApp Cloud API path.

Never commit or share QR screenshots, session files, access tokens, phone exports, or chat logs.
