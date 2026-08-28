import crypto from 'node:crypto'
import { createDurableQueue } from './queue.js'

function envBool(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}

export function createHandoffService({ logger = console } = {}) {
  const url = String(process.env.HANDOFF_WEBHOOK_URL || '').trim()
  const secret = String(process.env.HANDOFF_WEBHOOK_SECRET || '').trim()
  const encryptionKey = String(process.env.HANDOFF_QUEUE_ENCRYPTION_KEY || process.env.WA_QUEUE_ENCRYPTION_KEY || '').trim()
  const queue = createDurableQueue({ dir: process.env.HANDOFF_QUEUE_DIR || './data/handoff-queue', encryptionKey })
  const requireEncrypted = process.env.NODE_ENV === 'production' && envBool('HANDOFF_REQUIRE_ENCRYPTED_QUEUE', true)
  const configured = () => Boolean(url && secret && (!requireEncrypted || queue.encrypted))

  async function deliver(event) {
    const body = JSON.stringify(event)
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chat-ai-signature': signature },
      body,
      signal: AbortSignal.timeout(Number(process.env.HANDOFF_TIMEOUT_MS || 10_000)),
    })
    if (!response.ok) throw new Error(`Human handoff webhook failed HTTP ${response.status}`)
  }

  function enqueue({ contactId, text, state, messageId }) {
    const event = {
      type: 'human_handoff',
      contactId: String(contactId || '').slice(0, 300),
      message: String(text || '').slice(0, 2000),
      state: state || null,
      sourceMessageId: messageId || null,
      createdAt: new Date().toISOString(),
    }
    return queue.enqueue(event, { id: `handoff:${messageId || `${contactId}:${event.createdAt}`}` })
  }

  function start() {
    queue.start(async (event) => {
      try { await deliver(event) }
      catch (error) { logger.error?.({ error: error?.message || String(error) }, 'Human handoff delivery failed'); throw error }
    })
  }
  function stop() { queue.stop() }
  function getState() { return { configured: configured(), webhookConfigured: Boolean(url && secret), encryptedQueueRequired: requireEncrypted, queue: queue.stats() } }

  return { enqueue, start, stop, getState, isConfigured: configured }
}
