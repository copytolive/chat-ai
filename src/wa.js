import makeWASocket, { Browsers, DisconnectReason, fetchLatestWaWebVersion, useMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'

const waLogger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })
function envBool(name, fallback = false) { const raw = process.env[name]; if (raw == null || raw === '') return fallback; return /^(1|true|yes|on)$/i.test(raw) }
export function extractText(message) { const content = message?.message; if (!content) return ''; return (content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.videoMessage?.caption || '').trim() }
function statusCodeFromDisconnect(error) { return error?.output?.statusCode || error?.data?.statusCode || null }

export function createWhatsAppService({ onMessage, logger = console, metrics, makeSocket = makeWASocket, loadAuthState = useMultiFileAuthState, authDir = process.env.WA_AUTH_DIR || '.auth/whatsapp', fetchWaVersion = fetchLatestWaWebVersion } = {}) {
  const replyGroups = envBool('WA_REPLY_GROUPS', false)
  const allowedJids = new Set(String(process.env.WA_ALLOWED_JIDS || '').split(',').map((value) => value.trim()).filter(Boolean))
  const dedupe = new Map(); const dedupeTtlMs = Number(process.env.WA_DEDUPE_TTL_MS || 86_400_000)
  let socket = null; let generation = 0; let reconnectTimer = null
  const runtime = { connection: 'idle', qr: null, lastError: null, lastDisconnectCode: null, me: null, connectedAt: null, webVersion: null, browserIdentity: null }
  function cleanupDedupe() { const cutoff = Date.now() - dedupeTtlMs; for (const [id, seenAt] of dedupe.entries()) if (seenAt < cutoff) dedupe.delete(id) }
  function publicState() { return { provider: 'baileys', connection: runtime.connection, hasQr: Boolean(runtime.qr), lastError: runtime.lastError, lastDisconnectCode: runtime.lastDisconnectCode, accountPaired: Boolean(runtime.me), connectedAt: runtime.connectedAt, webVersion: runtime.webVersion, browserIdentity: runtime.browserIdentity, sessionPersistence: authDir, autoReconnect: true, unofficialProvider: true } }
  function getQr() { return runtime.qr }
  function shouldAccept(message) { const jid = message?.key?.remoteJid; if (!jid || message?.key?.fromMe) return false; if (jid === 'status@broadcast') return false; if (!replyGroups && jid.endsWith('@g.us')) return false; if (allowedJids.size > 0 && !allowedJids.has(jid)) return false; return true }
  async function handleMessages(event, currentSocket, run) {
    if (run !== generation || event?.type !== 'notify') return
    cleanupDedupe()
    for (const message of event.messages || []) {
      if (!shouldAccept(message)) continue
      const text = extractText(message); if (!text) continue
      const messageId = message.key.id || null
      if (messageId && dedupe.has(messageId)) { metrics?.inc('duplicateMessages'); continue }
      if (messageId) dedupe.set(messageId, Date.now())
      metrics?.inc('messagesReceived'); const started = Date.now()
      try {
        const reply = await onMessage?.({ jid: message.key.remoteJid, text, messageId })
        if (run !== generation || !reply) continue
        await currentSocket.sendMessage(message.key.remoteJid, { text: String(reply) }, { quoted: message })
        metrics?.inc('repliesSent')
      } catch (error) { metrics?.inc('failures'); logger.error?.({ jid: message.key.remoteJid, error: error?.message || String(error) }, 'WhatsApp message handling failed') }
      finally { metrics?.observeLatency(Date.now() - started) }
    }
  }
  async function connect() {
    generation += 1; const run = generation; clearTimeout(reconnectTimer); reconnectTimer = null
    runtime.connection = 'connecting'; runtime.qr = null; runtime.lastError = null; runtime.lastDisconnectCode = null
    const { state, saveCreds } = await loadAuthState(authDir)
    const socketOptions = { auth: state, logger: waLogger, markOnlineOnConnect: false, syncFullHistory: false, shouldSyncHistoryMessage: () => false, generateHighQualityLinkPreview: false, qrTimeout: Number(process.env.WA_QR_TIMEOUT_MS || 30_000) }
    const browserIdentity = String(process.env.WA_BROWSER_IDENTITY || '').trim().toLowerCase()
    if (browserIdentity === 'ubuntu') { socketOptions.browser = Browsers.ubuntu('Chrome'); runtime.browserIdentity = 'Ubuntu/Chrome' }
    else if (browserIdentity === 'windows') { socketOptions.browser = Browsers.windows('Chrome'); runtime.browserIdentity = 'Windows/Chrome' }
    else { runtime.browserIdentity = 'default' }
    if (envBool('WA_USE_LATEST_WEB_VERSION', false)) {
      try {
        const latest = await fetchWaVersion({ timeout: Number(process.env.WA_VERSION_FETCH_TIMEOUT_MS || 10_000) })
        if (Array.isArray(latest?.version) && latest.version.length === 3 && latest.isLatest !== false) {
          socketOptions.version = latest.version
          runtime.webVersion = latest.version.join('.')
          logger.info?.({ version: runtime.webVersion }, 'Using latest WhatsApp Web version for QR pairing')
        } else {
          runtime.lastError = latest?.error?.message || 'Latest WhatsApp Web version unavailable; using Baileys default'
          logger.warn?.({ error: runtime.lastError }, 'Could not resolve latest WhatsApp Web version')
        }
      } catch (error) {
        runtime.lastError = error?.message || String(error)
        logger.warn?.({ error: runtime.lastError }, 'Could not resolve latest WhatsApp Web version')
      }
    }
    const currentSocket = makeSocket(socketOptions)
    socket = currentSocket; currentSocket.ev.on('creds.update', saveCreds)
    currentSocket.ev.on('connection.update', (update) => {
      if (run !== generation) return
      if (update.qr) { runtime.qr = update.qr; runtime.connection = 'qr'; runtime.lastError = null }
      if (update.connection === 'open') { runtime.connection = 'open'; runtime.qr = null; runtime.lastError = null; runtime.me = currentSocket.user?.id || 'paired'; runtime.connectedAt = new Date().toISOString(); logger.info?.({ autoReconnect: true }, 'WhatsApp connected and automatic message handling is active') }
      if (update.connection === 'close') {
        const code = statusCodeFromDisconnect(update.lastDisconnect?.error); const loggedOut = code === DisconnectReason.loggedOut
        runtime.connection = loggedOut ? 'logged_out' : 'closed'; runtime.qr = null; runtime.lastDisconnectCode = code; runtime.lastError = update.lastDisconnect?.error?.message || null; runtime.me = null
        if (!loggedOut && run === generation) reconnectTimer = setTimeout(() => { if (run !== generation) return; connect().catch((error) => { runtime.connection = 'error'; runtime.lastError = error?.message || String(error); logger.error?.({ error: runtime.lastError }, 'WhatsApp reconnect failed') }) }, 1500)
      }
    })
    currentSocket.ev.on('messages.upsert', (event) => handleMessages(event, currentSocket, run))
    return publicState()
  }
  async function reconnect() { generation += 1; clearTimeout(reconnectTimer); reconnectTimer = null; const oldSocket = socket; socket = null; try { oldSocket?.end?.(new Error('manual reconnect')) } catch {} return connect() }
  function stop() { generation += 1; clearTimeout(reconnectTimer); reconnectTimer = null; const oldSocket = socket; socket = null; try { oldSocket?.end?.(new Error('service shutdown')) } catch {} }
  return { provider: 'baileys', start: connect, reconnect, stop, getState: publicState, getQr, mountRoutes: () => {} }
}
