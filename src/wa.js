import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import pino from 'pino'

const waLogger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })

function envBool(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw)
}

export function extractText(message) {
  const content = message?.message
  if (!content) return ''
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ''
  ).trim()
}

function statusCodeFromDisconnect(error) {
  return error?.output?.statusCode || error?.data?.statusCode || null
}

export function createWhatsAppService({ onMessage, logger = console } = {}) {
  const authDir = process.env.WA_AUTH_DIR || '.auth/whatsapp'
  const replyGroups = envBool('WA_REPLY_GROUPS', false)
  const allowedJids = new Set(
    (process.env.WA_ALLOWED_JIDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )

  let socket = null
  let generation = 0
  let reconnectTimer = null

  const runtime = {
    connection: 'idle',
    qr: null,
    lastError: null,
    lastDisconnectCode: null,
    me: null,
    connectedAt: null,
  }

  function publicState() {
    return {
      connection: runtime.connection,
      hasQr: Boolean(runtime.qr),
      lastDisconnectCode: runtime.lastDisconnectCode,
      accountPaired: Boolean(runtime.me),
      connectedAt: runtime.connectedAt,
    }
  }

  function getQr() {
    return runtime.qr
  }

  function shouldAccept(message) {
    const jid = message?.key?.remoteJid
    if (!jid || message?.key?.fromMe) return false
    if (jid === 'status@broadcast') return false
    if (!replyGroups && jid.endsWith('@g.us')) return false
    if (allowedJids.size > 0 && !allowedJids.has(jid)) return false
    return true
  }

  async function handleMessages(event, currentSocket, run) {
    if (run !== generation || event?.type !== 'notify') return

    for (const message of event.messages || []) {
      if (!shouldAccept(message)) continue
      const text = extractText(message)
      if (!text) continue

      try {
        const reply = await onMessage?.({
          jid: message.key.remoteJid,
          text,
          messageId: message.key.id || null,
        })
        if (run !== generation || !reply) continue
        await currentSocket.sendMessage(message.key.remoteJid, { text: String(reply) }, { quoted: message })
      } catch (error) {
        logger.error?.({
          jid: message.key.remoteJid,
          error: error?.message || String(error),
        }, 'WhatsApp message handling failed')
      }
    }
  }

  async function connect() {
    generation += 1
    const run = generation
    clearTimeout(reconnectTimer)
    reconnectTimer = null

    runtime.connection = 'connecting'
    runtime.qr = null
    runtime.lastError = null
    runtime.lastDisconnectCode = null

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const currentSocket = makeWASocket({
      auth: state,
      logger: waLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
    })
    socket = currentSocket

    currentSocket.ev.on('creds.update', saveCreds)

    currentSocket.ev.on('connection.update', (update) => {
      if (run !== generation) return

      if (update.qr) {
        runtime.qr = update.qr
        runtime.connection = 'qr'
      }

      if (update.connection === 'open') {
        runtime.connection = 'open'
        runtime.qr = null
        runtime.lastError = null
        runtime.me = currentSocket.user?.id || 'paired'
        runtime.connectedAt = new Date().toISOString()
        logger.info?.('WhatsApp connected')
      }

      if (update.connection === 'close') {
        const code = statusCodeFromDisconnect(update.lastDisconnect?.error)
        const loggedOut = code === DisconnectReason.loggedOut
        runtime.connection = loggedOut ? 'logged_out' : 'closed'
        runtime.qr = null
        runtime.lastDisconnectCode = code
        runtime.lastError = update.lastDisconnect?.error?.message || null
        runtime.me = null

        if (!loggedOut && run === generation) {
          reconnectTimer = setTimeout(() => {
            if (run !== generation) return
            connect().catch((error) => {
              runtime.connection = 'error'
              runtime.lastError = error?.message || String(error)
              logger.error?.({ error: runtime.lastError }, 'WhatsApp reconnect failed')
            })
          }, 1500)
        }
      }
    })

    currentSocket.ev.on('messages.upsert', (event) => {
      handleMessages(event, currentSocket, run)
    })

    return publicState()
  }

  async function reconnect() {
    generation += 1
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    const oldSocket = socket
    socket = null
    try {
      oldSocket?.end?.(new Error('manual reconnect'))
    } catch {
      // Socket may already be closed.
    }
    return connect()
  }

  return {
    start: connect,
    reconnect,
    getState: publicState,
    getQr,
  }
}
