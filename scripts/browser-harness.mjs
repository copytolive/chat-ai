import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.BROWSER_HARNESS_PORT || 8765)
function send(res, status, type, body) { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
function readBody(req) { return new Promise((resolve) => { const chunks = []; req.on('data', (chunk) => chunks.push(chunk)); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))) }) }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/status') return send(res, 200, 'application/json', JSON.stringify({ ok: true, release: 'browser-test', automation: { enabled: true, mode: 'automatic' }, whatsapp: { provider: 'cloud', connection: 'ready', configured: true, accountPaired: true, queue: { encrypted: true, pending: 0, processedRecent: 21 } }, ai: { enabled: true, configured: true, model: 'mock-primary', fallbackConfigured: true, fallbackModel: 'mock-fallback' }, marketing: { enabled: true, configured: true, activeSessions: 1, verifiedKnowledgeFacts: 12, sessionPersistence: 'durable-json-single-instance-hashed-contact-id' }, handoff: { mode: 'local', configured: true, localInbox: true, queue: { encrypted: true, pending: 0 } }, metrics: { messagesReceived: 21, repliesSent: 20, failures: 0, handoffs: 2, optOuts: 1, p95LatencyMs: 384 } }))
  if (url.pathname === '/ready') return send(res, 200, 'application/json', JSON.stringify({ ok: true }))
  if (url.pathname === '/marketing/preview' && req.method === 'POST') { await readBody(req); return send(res, 200, 'application/json', JSON.stringify({ ok: true, event: 'reply', reply: 'Browser acceptance reply: kebutuhan prospek dipahami tanpa mengarang fakta.', state: { stage: 3, stageName: 'discovery', leadScore: 42, optedOut: false, handoff: false } })) }
  if (url.pathname === '/app.js') return send(res, 200, 'text/javascript', fs.readFileSync(path.join(root, 'public/app.js')))
  if (url.pathname === '/style.css') return send(res, 200, 'text/css', fs.readFileSync(path.join(root, 'public/style.css')))
  if (url.pathname === '/' || url.pathname === '/index.html') {
    let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
    html = html.replace('</body>', `<script>setTimeout(()=>{document.querySelector('#preview-input').value='Saya tertarik untuk tim saya.';document.querySelector('#preview-form').requestSubmit();},700);</script></body>`)
    return send(res, 200, 'text/html; charset=utf-8', html)
  }
  return send(res, 404, 'text/plain', 'not found')
})
server.listen(port, '127.0.0.1', () => console.log(`browser harness http://127.0.0.1:${port}`))
