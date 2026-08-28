import crypto from 'node:crypto'
import { createDurableQueue } from './queue.js'

function envBool(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}
function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return false
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody || Buffer.alloc(0)).digest('hex')}`
  return timingSafeEqualText(expected, signatureHeader)
}

export function extractCloudMessages(payload) {
  const out = []
  if (payload?.object !== 'whatsapp_business_account') return out
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change?.value || {}
      for (const message of value.messages || []) {
        const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || message?.image?.caption || message?.video?.caption || ''
        if (!message?.from || !message?.id || !String(text).trim()) continue
        out.push({ jid: String(message.from), text: String(text).trim(), messageId: String(message.id), phoneNumberId: String(value?.metadata?.phone_number_id || '') })
      }
    }
  }
  return out
}

export function createWhatsAppCloudService({ onMessage, logger = console, metrics } = {}) {
  const token = String(process.env.WA_CLOUD_ACCESS_TOKEN || '').trim()
  const phoneNumberId = String(process.env.WA_CLOUD_PHONE_NUMBER_ID || '').trim()
  const verifyToken = String(process.env.WA_CLOUD_VERIFY_TOKEN || '').trim()
  const appSecret = String(process.env.WA_CLOUD_APP_SECRET || '').trim()
  const graphVersion = String(process.env.WA_GRAPH_VERSION || 'v26.0').trim()
  const queue = createDurableQueue()
  const requireEncryptedQueue = process.env.NODE_ENV === 'production' && envBool('WA_REQUIRE_ENCRYPTED_QUEUE', true)

  function credentialsConfigured() { return Boolean(token && phoneNumberId && verifyToken && appSecret) }
  function configured() { return Boolean(credentialsConfigured() && (!requireEncryptedQueue || queue.encrypted)) }

  async function sendText(to, text) {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: String(text).slice(0, 4096) } }),
      signal: AbortSignal.timeout(Number(process.env.WA_SEND_TIMEOUT_MS || 15_000)),
    })
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500)
      throw new Error(`WhatsApp Cloud send failed HTTP ${response.status}${body ? `: ${body}` : ''}`)
    }
    return response.json().catch(() => ({}))
  }

  async function processMessage(message) {
    metrics?.inc('messagesReceived')
    const started = Date.now()
    try {
      const reply = await onMessage?.(message)
      if (reply) { await sendText(message.jid, reply); metrics?.inc('repliesSent') }
    } catch (error) {
      metrics?.inc('failures')
      logger.error?.({ error: error?.message || String(error), messageId: message.messageId }, 'WhatsApp Cloud queued message handling failed')
      throw error
    } finally { metrics?.observeLatency(Date.now() - started) }
  }

  function mountRoutes(app) {
    app.get('/webhooks/whatsapp', (req, res) => {
      const mode = String(req.query['hub.mode'] || '')
      const supplied = String(req.query['hub.verify_token'] || '')
      const challenge = String(req.query['hub.challenge'] || '')
      if (mode === 'subscribe' && timingSafeEqualText(supplied, verifyToken)) return res.status(200).send(challenge)
      return res.sendStatus(403)
    })
    app.post('/webhooks/whatsapp', (req, res) => {
      if (!verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) return res.status(401).json({ ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' })
      const messages = extractCloudMessages(req.body)
      try {
        for (const message of messages) {
          const result = queue.enqueue(message, { id: message.messageId })
          if (result.duplicate) metrics?.inc('duplicateMessages')
        }
      } catch (error) {
        logger.error?.({ error: error?.message || String(error) }, 'Durable webhook enqueue failed')
        return res.status(503).json({ ok: false, error: 'WEBHOOK_QUEUE_UNAVAILABLE' })
      }
      return res.sendStatus(200)
    })
  }

  return {
    provider: 'cloud',
    start: async () => { queue.start(processMessage); return { connection: configured() ? 'ready' : 'misconfigured' } },
    stop: () => queue.stop(),
    reconnect: async () => ({ connection: configured() ? 'ready' : 'misconfigured' }),
    getQr: () => null,
    getState: () => ({ provider: 'cloud', connection: configured() ? 'ready' : 'misconfigured', configured: configured(), credentialsConfigured: credentialsConfigured(), hasQr: false, accountPaired: Boolean(phoneNumberId), phoneNumberConfigured: Boolean(phoneNumberId), webhookSignatureRequired: true, queue: queue.stats(), encryptedQueueRequired: requireEncryptedQueue }),
    mountRoutes,
    sendText,
  }
}
