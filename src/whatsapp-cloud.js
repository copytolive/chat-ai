import crypto from 'node:crypto'

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
        const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || ''
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
  const dedupe = new Map()
  const dedupeTtlMs = Number(process.env.WA_DEDUPE_TTL_MS || 86_400_000)

  function configured() { return Boolean(token && phoneNumberId && verifyToken && appSecret) }
  function cleanupDedupe() {
    const cutoff = Date.now() - dedupeTtlMs
    for (const [id, seenAt] of dedupe.entries()) if (seenAt < cutoff) dedupe.delete(id)
  }
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
  function mountRoutes(app) {
    app.get('/webhooks/whatsapp', (req, res) => {
      const mode = String(req.query['hub.mode'] || '')
      const supplied = String(req.query['hub.verify_token'] || '')
      const challenge = String(req.query['hub.challenge'] || '')
      if (mode === 'subscribe' && timingSafeEqualText(supplied, verifyToken)) return res.status(200).send(challenge)
      return res.sendStatus(403)
    })
    app.post('/webhooks/whatsapp', async (req, res) => {
      if (!verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) return res.status(401).json({ ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' })
      const messages = extractCloudMessages(req.body)
      res.sendStatus(200)
      if (!messages.length) return
      cleanupDedupe()
      for (const message of messages) {
        if (dedupe.has(message.messageId)) { metrics?.inc('duplicateMessages'); continue }
        dedupe.set(message.messageId, Date.now())
        metrics?.inc('messagesReceived')
        const started = Date.now()
        try {
          const reply = await onMessage?.(message)
          if (reply) { await sendText(message.jid, reply); metrics?.inc('repliesSent') }
        } catch (error) {
          metrics?.inc('failures')
          logger.error?.({ error: error?.message || String(error), messageId: message.messageId }, 'WhatsApp Cloud message handling failed')
        } finally { metrics?.observeLatency(Date.now() - started) }
      }
    })
  }
  return {
    provider: 'cloud',
    start: async () => ({ connection: configured() ? 'ready' : 'misconfigured' }),
    reconnect: async () => ({ connection: configured() ? 'ready' : 'misconfigured' }),
    getQr: () => null,
    getState: () => ({ provider: 'cloud', connection: configured() ? 'ready' : 'misconfigured', configured: configured(), hasQr: false, accountPaired: Boolean(phoneNumberId), phoneNumberConfigured: Boolean(phoneNumberId), webhookSignatureRequired: true }),
    mountRoutes,
    sendText,
  }
}
