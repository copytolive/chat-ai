# Public test readiness

Target: disposable/test WhatsApp account only.

- GitHub Pages public portal: expected
- Codespaces port 3847: public test visibility reapplied on start/attach
- Scanner UI: `/wa-scanner/`
- QR/status: public for test
- Admin mutations: disabled
- Session files: Codespace-only, ignored by Git
- Automation: enabled
- Fallback AI: local mock when no external AI is configured
- Public readiness doctor: `bash scripts/public-test-doctor.sh`

Final physical acceptance remains: scan the QR from the test phone and send a real inbound WhatsApp message from another test number.
