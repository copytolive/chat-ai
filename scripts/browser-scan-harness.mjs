import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.BROWSER_SCAN_HARNESS_PORT || 8766)
const qr = await QRCode.toDataURL('COPYTOLIVE-SCAN-ACCEPTANCE-PAIRING-PAYLOAD', { errorCorrectionLevel: 'M', width: 360, margin: 2 })
let connected = false
function send(res, status, type, body) { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
function statusPayload() {
  return {
    ok: true,
    release: 'browser-scan-test',
    automation: { enabled: true, mode: 'automatic' },
    whatsapp: { provider: 'baileys', connection: connected ? 'open' : 'qr', hasQr: !connected, accountPaired: connected, autoReconnect: true, sessionPersistence: '/data/wa-auth', unofficialProvider: true },
    ai: { enabled: true, configured: true, model: 'mock-primary', fallbackConfigured: true, fallbackModel: 'mock-fallback' },
    marketing: { enabled: true, configured: true, activeSessions: 0, verifiedKnowledgeFacts: 12, sessionPersistence: 'durable-json-single-instance-hashed-contact-id' },
    handoff: { mode: 'local', configured: true, localInbox: true, queue: { encrypted: true, pending: 0 } },
    metrics: { messagesReceived: connected ? 1 : 0, repliesSent: connected ? 1 : 0, failures: 0, handoffs: 0, optOuts: 0, p95LatencyMs: connected ? 120 : null },
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/status') return send(res, 200, 'application/json', JSON.stringify(statusPayload()))
  if (url.pathname === '/ready') return send(res, connected ? 200 : 503, 'application/json', JSON.stringify({ ok: connected, provider: 'baileys', checks: { whatsapp: connected, ai: true, marketing: true, handoff: true } }))
  if (url.pathname === '/qr') return connected ? send(res, 404, 'application/json', JSON.stringify({ ok: false, error: 'QR_NOT_AVAILABLE' })) : send(res, 200, 'application/json', JSON.stringify({ ok: true, qr }))
  if (url.pathname === '/simulate-scan' && req.method === 'POST') { connected = true; return send(res, 200, 'application/json', JSON.stringify({ ok: true, connected: true })) }
  if (url.pathname === '/marketing/preview' && req.method === 'POST') return send(res, 200, 'application/json', JSON.stringify({ ok: true, event: 'reply', reply: 'Scan-mode automatic reply acceptance.', state: { stage: 3, stageName: 'discovery', leadScore: 42, optedOut: false, handoff: false } }))
  if (url.pathname === '/app.js') return send(res, 200, 'text/javascript', fs.readFileSync(path.join(root, 'public/app.js')))
  if (url.pathname === '/style.css') return send(res, 200, 'text/css', fs.readFileSync(path.join(root, 'public/style.css')))
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'))
  return send(res, 404, 'text/plain', 'not found')
})
server.listen(port, '127.0.0.1', () => console.log(`browser scan harness http://127.0.0.1:${port}`))
