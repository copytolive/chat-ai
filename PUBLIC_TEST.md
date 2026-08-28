# CopyToLive Chat AI — Public WhatsApp Test Mode

Public entry point: https://copytolive.github.io/chat-ai/

This temporary test profile is designed for a disposable/test WhatsApp account.

## Expected flow

1. Open the GitHub Pages URL.
2. Click **START WHATSAPP SCANNER**.
3. Codespaces starts the scanner and attempts to make port `3847` public.
4. The browser opens `/wa-scanner/`.
5. Run `bash scripts/public-test-doctor.sh` if you want a machine-readable readiness check.
6. Scan the QR from the test WhatsApp account.
7. Wait for `CONNECTED · AUTO-RUN · LAUNCH READY`.
8. Send a message from a second test number and verify an automatic reply.

The public test profile intentionally exposes the scanner UI/QR/status through the Codespaces public forwarded port. Admin mutation endpoints remain disabled. Linked-device session files remain inside the Codespace and are ignored by Git.

For the detailed flow and fallback commands, see `GITHUB_SCAN.md`.
