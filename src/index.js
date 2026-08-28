import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import QRCode from 'qrcode'
import pino from 'pino'
import { fileURLToPath } from 'node:url'
import { createWhatsAppService } from './wa.js'
import { generateReply, getAIStatus } from './ai.js'
import { createMarketingAgent } from './marketing.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const app = express()
const port = Number(process.env.PORT || 3847)
const host = process.env.HOST || '127.0.0.1'
const scannerToken = (process.env.SCANNER_TOKEN || '').trim()
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])
if (!loopbackHosts.has(host) && !scannerToken) {
  throw new Error('Refusing non-loopback bind without SCANNER_TOKEN')
}

app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '32kb' }))
app.use(express.static(publicDir, { extensions: ['html'] }))

function scannerAuth(req, res, next) {
  if (!scannerToken) return next()
  const suppliedToken = String(req.get('x-scanner-token') || '')
  if (suppliedToken !== scannerToken) {
    return res.status(401).json({ ok: false, error: 'SCANNER_AUTH_REQUIRED' })
  }
  return next()
}

const marketing = createMarketingAgent()
const wa = createWhatsAppService({
  logger,
  onMessage: async ({ jid, text }) => {
    logger.info({ jid }, 'Incoming WhatsApp text accepted')
    if (marketing.isEnabled()) {
      return marketing.process({ jid, text })
    }
    return generateReply(text)
  },
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'chat-ai',
    uptimeSeconds: Math.round(process.uptime()),
    now: new Date().toISOString(),
  })
})

app.get('/status', scannerAuth, (_req, res) => {
  res.json({
    ok: true,
    whatsapp: wa.getState(),
    ai: getAIStatus(),
    marketing: marketing.getStatus(),
  })
})

app.get('/qr', scannerAuth, async (_req, res) => {
  const qr = wa.getQr()
  if (!qr) {
    return res.status(404).json({
      ok: false,
      error: 'QR_NOT_AVAILABLE',
      whatsapp: wa.getState(),
    })
  }

  try {
    const dataUrl = await QRCode.toDataURL(qr, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
    })
    return res.json({ ok: true, qr: dataUrl })
  } catch (error) {
    logger.error({ err: error }, 'QR rendering failed')
    return res.status(500).json({ ok: false, error: 'QR_RENDER_FAILED' })
  }
})

app.post('/marketing/preview', scannerAuth, async (req, res) => {
  if (!marketing.isEnabled()) {
    return res.status(409).json({ ok: false, error: 'MARKETING_AGENT_DISABLED' })
  }

  const text = String(req.body?.text || '').trim().slice(0, 6000)
  const sessionId = String(req.body?.sessionId || 'default')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80) || 'default'

  if (!text) return res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' })

  try {
    const jid = `preview:${sessionId}`
    const reply = await marketing.process({ jid, text })
    return res.json({
      ok: true,
      reply,
      state: marketing.getSessionState(jid),
    })
  } catch (error) {
    logger.error({ err: error }, 'Marketing preview failed')
    return res.status(500).json({ ok: false, error: 'MARKETING_PREVIEW_FAILED' })
  }
})

app.post('/reconnect', scannerAuth, async (req, res) => {
  const configuredToken = (process.env.ADMIN_TOKEN || '').trim()
  if (!configuredToken) {
    return res.status(403).json({ ok: false, error: 'ADMIN_RECONNECT_DISABLED' })
  }

  const suppliedToken = String(req.get('x-admin-token') || '')
  if (suppliedToken !== configuredToken) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' })
  }

  try {
    const whatsapp = await wa.reconnect()
    return res.json({ ok: true, whatsapp })
  } catch (error) {
    logger.error({ err: error }, 'Manual reconnect failed')
    return res.status(500).json({ ok: false, error: 'RECONNECT_FAILED' })
  }
})

app.use((error, _req, res, _next) => {
  logger.error({ err: error }, 'HTTP request failed')
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' })
})

const server = app.listen(port, host, () => {
  logger.info({ host, port, scannerAuth: Boolean(scannerToken) }, 'chat-ai HTTP service listening')
})

wa.start().catch((error) => {
  logger.error({ err: error }, 'Initial WhatsApp connection failed; HTTP service remains available')
})

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
