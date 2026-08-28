# Production launch and rollback runbook

The service supports two launch paths. Use **Cloud mode** for official Meta production. Use **QR scan mode** when you explicitly want the one-scan WhatsApp Web workflow.

## QR scan mode — one scan, automatic operation

1. Copy `.env.scan.example` to `.env.scan`.
2. Set strong, different `SCANNER_TOKEN` and `ADMIN_TOKEN` values.
3. Configure the AI endpoint/model and reviewed marketing/knowledge facts.
4. Generate a 32-byte `HANDOFF_QUEUE_ENCRYPTION_KEY` and store it only in the deployment secret store/file permissions expected by your host.
5. Keep `WA_AUTH_DIR=/data/wa-auth`, `WA_PROVIDER=baileys`, `AUTOMATION_ENABLED=true`, `HANDOFF_MODE=local`.
6. Deploy with `docker compose -f docker-compose.scan.yml up -d --build` behind HTTPS.
7. Open the launch console. Before pairing it must show QR + `NOT READY` + `AUTO-RUN ENABLED`.
8. In WhatsApp open **Linked devices → Link a device** and scan the QR.
9. Require the console to change to `CONNECTED · Auto-run` and `/ready` to return HTTP 200.
10. Send a controlled inbound message and confirm the AI reply arrives automatically without pressing any send/reconnect button.
11. Restart the container. The saved `/data/wa-auth` session must reconnect without a new QR and automatic replies must resume.
12. Test `STOP`, explicit re-opt-in, human handoff, local encrypted inbox listing/ack, and the global kill switch.

If WhatsApp explicitly logs the linked device out, a new QR scan is expected. Baileys is unofficial; an account/protocol change by WhatsApp can require maintenance even though the service itself reconnects automatically.

## Official Cloud mode

1. Create a reviewed `knowledge.json` from `knowledge.example.json` and mount it at `/data/knowledge.json`.
2. Configure WhatsApp Business Platform credentials and webhook URL `https://<host>/webhooks/whatsapp`.
3. Generate a dedicated 32-byte `WA_QUEUE_ENCRYPTION_KEY` (64 hex characters or base64) and store it only in the deployment secret manager.
4. Configure primary AI and, preferably, a fallback provider/model.
5. Set strong, different `SCANNER_TOKEN` and `ADMIN_TOKEN` secrets.
6. Choose `HANDOFF_MODE=local` for the built-in encrypted operator inbox or `HANDOFF_MODE=webhook` for a signed CRM/operator bridge.
7. Keep `AUTOMATION_ENABLED=false` for initial deployment.
8. Deploy with Docker Compose behind HTTPS and keep `/data` on durable encrypted storage.
9. Confirm `/health` is 200 and `/ready` is 503 only because the kill switch is OFF.
10. Enable automation using the protected admin endpoint or set `AUTOMATION_ENABLED=true` and restart.
11. Require `/ready` HTTP 200 and run `npm run launch:doctor` from a protected operator host.
12. Send controlled inbound messages and verify discovery, objection, opt-out, explicit re-opt-in, human handoff, and duplicate Meta message-ID suppression.
13. Restart the service and confirm opt-out/handoff state still applies and pending queue work resumes.

## Launch gates

- CI test, browser and Docker jobs green.
- 1,000-case deterministic conversation acceptance passes.
- QR service acceptance proves `QR → open → inbound message → automatic reply`.
- Real Chromium renders an actual QR before pairing and `NOT READY`.
- Real Chromium validates post-pair `CONNECTED`, `AUTO-RUN ENABLED`, `/data/wa-auth` persistence and `LAUNCH READY`.
- Official Cloud webhook verification and HMAC tests pass.
- Cloud webhook ACK occurs only after durable encrypted queue write; processed message IDs remain deduplicated across restart.
- Persistent opt-out survives restart and durable state does not contain raw contact IDs.
- Human handoff suppresses bot replies until explicitly resumed.
- Built-in local handoff inbox is AES-256-GCM encrypted at rest, or signed webhook handoff is configured.
- No critical `npm audit` findings.
- Locked dependencies install with `npm ci`.
- Production Docker image builds successfully.

## Protected local handoff inbox

List pending human-takeover items:

```bash
curl https://<host>/admin/handoffs \
  -H "x-scanner-token: $SCANNER_TOKEN" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

After an operator has handled an item, acknowledge its queue ID:

```bash
curl -X POST https://<host>/admin/handoffs/<QUEUE_ID>/ack \
  -H "x-scanner-token: $SCANNER_TOKEN" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

Resume AI for that contact only when the operator decides automation may continue:

```bash
curl -X POST https://<host>/admin/handoff/resume \
  -H "x-scanner-token: $SCANNER_TOKEN" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"contactId":"<authorized-contact-id>"}'
```

## Emergency stop

Set automation OFF:

```bash
curl -X POST https://<host>/admin/automation \
  -H "x-scanner-token: $SCANNER_TOKEN" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"enabled":false}'
```

This stops automated replies without taking down health/status endpoints or deleting queued/suppression/session state.

## Rollback

1. Turn automation OFF.
2. Redeploy the previous known-good image tag/commit.
3. Keep the `/data` volume. In scan mode this preserves the linked-device session; in Cloud mode it preserves queue/suppression state.
4. Keep the same queue encryption keys while encrypted queue items remain pending.
5. Run `/health`, `/ready`, provider verification and a controlled inbound test.
6. Re-enable automation only after validation.
