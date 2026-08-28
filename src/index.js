import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import QRCode from 'qrcode'
import pino from 'pino'
import { createWhatsAppService } from './wa.js'
import { generateReply, getAIStatus } from './ai.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const app = express()
const port = Number(process.env.PORT || 3847)
const host = process.env.HOST || '0.0.0.0'

app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '32kb' }))
app.use(express.static(new URL('../public', import.meta.url).pathname, { extensions: ['html'] }))

const wa = createWhatsAppService({
  logger,
  onMessage: async ({ jid, text }) => {
    logger.info({ jid }, 'Incoming WhatsApp text accepted')
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

app.get('/status', (_req, res) => {
  res.json({
    ok: true,
    whatsapp: wa.getState(),
    ai: getAIStatus(),
  })
})

app.get('/qr', async (_req, res) => {
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

app.post('/reconnect', async (req, res) => {
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
  logger.info({ host, port }, 'chat-ai HTTP service listening')
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
