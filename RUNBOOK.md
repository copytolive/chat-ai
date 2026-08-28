# Production launch and rollback runbook

## Pre-launch

1. Create a reviewed `knowledge.json` from `knowledge.example.json` and mount it at `/data/knowledge.json`.
2. Configure WhatsApp Business Platform credentials and webhook URL `https://<host>/webhooks/whatsapp`.
3. Configure primary AI and, preferably, a fallback provider/model.
4. Set strong `SCANNER_TOKEN` and `ADMIN_TOKEN` secrets.
5. Keep `AUTOMATION_ENABLED=false` for initial deployment.
6. Deploy with Docker Compose behind HTTPS.
7. Confirm `/health` is 200 and `/ready` is 503 only because the kill switch is OFF.
8. Temporarily enable automation using the protected admin endpoint or set `AUTOMATION_ENABLED=true` and restart.
9. Require `/ready` HTTP 200 and run `npm run launch:doctor` from a protected operator host.
10. Send controlled inbound messages from an authorized WhatsApp test number and verify discovery, objection, opt-out, explicit re-opt-in, and human handoff.

## Launch gates

- CI test, browser and Docker jobs green.
- 1000-case deterministic acceptance passes.
- Official Cloud API webhook verification and HMAC tests pass.
- `/ready` 200 with Cloud API, AI, marketing, knowledge and automation enabled.
- Persistent opt-out survives restart.
- Human handoff suppresses bot replies until explicitly resumed by admin.
- No critical `npm audit` findings.
- Browser console shows `LAUNCH READY` and preview reply/stage.

## Emergency stop

Set automation OFF:

```bash
curl -X POST https://<host>/admin/automation \
  -H "x-scanner-token: $SCANNER_TOKEN" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"enabled":false}'
```

This stops automated replies without taking down health/status endpoints.

## Rollback

1. Turn automation OFF.
2. Redeploy the previous known-good image tag/commit.
3. Keep the `/data` volume; do not roll back suppression state.
4. Run `/health`, `/ready`, webhook verification and a controlled inbound test.
5. Re-enable automation only after validation.
