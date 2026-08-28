# Production launch and rollback runbook

## Pre-launch

1. Create a reviewed `knowledge.json` from `knowledge.example.json` and mount it at `/data/knowledge.json`.
2. Configure WhatsApp Business Platform credentials and webhook URL `https://<host>/webhooks/whatsapp`.
3. Generate a dedicated 32-byte `WA_QUEUE_ENCRYPTION_KEY` (64 hex characters or base64) and store it only in the deployment secret manager.
4. Configure primary AI and, preferably, a fallback provider/model.
5. Set strong, different `SCANNER_TOKEN` and `ADMIN_TOKEN` secrets.
6. Keep `AUTOMATION_ENABLED=false` for initial deployment.
7. Deploy with Docker Compose behind HTTPS and keep `/data` on durable encrypted storage.
8. Confirm `/health` is 200 and `/ready` is 503 only because the kill switch is OFF.
9. Temporarily enable automation using the protected admin endpoint or set `AUTOMATION_ENABLED=true` and restart.
10. Require `/ready` HTTP 200 and run `npm run launch:doctor` from a protected operator host.
11. Send controlled inbound messages from an authorized WhatsApp test number and verify discovery, objection, opt-out, explicit re-opt-in, human handoff, and that a repeated Meta message ID does not cause a duplicate reply.
12. Restart the service and confirm opt-out/handoff state still applies and pending queue work resumes.

## Launch gates

- CI test, browser and Docker jobs green.
- 1000-case deterministic acceptance passes.
- Official Cloud API webhook verification and HMAC tests pass.
- `/ready` 200 with Cloud API, AI, marketing, knowledge, encrypted queue and automation enabled.
- Persistent opt-out survives restart and durable state does not contain raw contact IDs.
- Human handoff suppresses bot replies until explicitly resumed by admin.
- Cloud webhook ACK occurs only after durable queue write; processed message IDs remain deduplicated across restart.
- No critical `npm audit` findings.
- Locked dependencies install with `npm ci`.
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

This stops automated replies without taking down health/status endpoints or deleting queued/suppression state.

## Rollback

1. Turn automation OFF.
2. Redeploy the previous known-good image tag/commit.
3. Keep the `/data` volume; do not roll back suppression state or delete pending webhook queue data.
4. Keep the same queue encryption key for the rollback image while encrypted queue items remain pending.
5. Run `/health`, `/ready`, webhook verification and a controlled inbound test.
6. Re-enable automation only after validation.
