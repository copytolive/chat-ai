import express from 'express'
import helmet from 'helmet'
import QRCode from 'qrcode'
import pino from 'pino'
import { fileURLToPath } from 'node:url'
import { createWhatsAppService } from './wa.js'
import { createWhatsAppCloudService } from './whatsapp-cloud.js'
import { generateReply, getAIStatus } from './ai.js'
import { createMarketingAgent } from './marketing.js'
import { createMetrics } from './metrics.js'
import { createRateLimit } from './rate-limit.js'

function envBool(name, fallback = false) { const raw = process.env[name]; if (raw == null || raw === '') return fallback; return /^(1|true|yes|on)$/i.test(raw) }
function safeEqual(a, b) { const left = String(a || ''); const right = String(b || ''); return Boolean(left && right && left.length === right.length && left === right) }

export function createRuntime({ logger = pino({ level: process.env.LOG_LEVEL || 'info' }) } = {}) {
  const metrics = createMetrics()
  const marketing = createMarketingAgent()
  const providerName = String(process.env.WA_PROVIDER || 'baileys').trim().toLowerCase()
  const control = { automationEnabled: envBool('AUTOMATION_ENABLED', false) }
  const onMessage = async ({ jid, text }) => {
    if (!control.automationEnabled) return null
    if (marketing.isEnabled()) {
      const result = await marketing.processDetailed({ jid, text })
      if (result.event === 'opt_out') metrics.inc('optOuts')
      if (result.event === 'human_handoff') metrics.inc('handoffs')
      return result.reply
    }
    return generateReply(text)
  }
  let whatsapp
  if (providerName === 'cloud') whatsapp = createWhatsAppCloudService({ onMessage, logger, metrics })
  else if (providerName === 'baileys') whatsapp = createWhatsAppService({ onMessage, logger, metrics })
  else throw new Error(`Unsupported WA_PROVIDER: ${providerName}`)
  if (process.env.NODE_ENV === 'production' && envBool('PRODUCTION_REQUIRE_CLOUD', true) && providerName !== 'cloud' && !envBool('ALLOW_UNOFFICIAL_WA', false)) throw new Error('Production requires WA_PROVIDER=cloud unless ALLOW_UNOFFICIAL_WA=true is explicitly set')
  return { logger, metrics, marketing, whatsapp, control, providerName }
}

export function createApp({ runtime = createRuntime() } = {}) {
  const { logger, metrics, marketing, whatsapp, control, providerName } = runtime
  const app = express()
  const scannerToken = String(process.env.SCANNER_TOKEN || '').trim()
  const adminToken = String(process.env.ADMIN_TOKEN || '').trim()
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  app.disable('x-powered-by')
  app.set('trust proxy', envBool('TRUST_PROXY', false) ? 1 : false)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '64kb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer) } }))
  const webhookLimit = createRateLimit({ windowMs: 60_000, max: Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE || 600) })
  app.use('/webhooks', webhookLimit)
  whatsapp.mountRoutes?.(app)
  const scannerLimit = createRateLimit({ windowMs: 60_000, max: Number(process.env.SCANNER_RATE_LIMIT_PER_MINUTE || 120) })
  app.use(['/status', '/metrics', '/qr', '/marketing', '/admin', '/reconnect'], scannerLimit)
  app.use(express.static(publicDir, { extensions: ['html'] }))
  function scannerAuth(req, res, next) { if (!scannerToken) return next(); if (!safeEqual(req.get('x-scanner-token'), scannerToken)) return res.status(401).json({ ok: false, error: 'SCANNER_AUTH_REQUIRED' }); return next() }
  function adminAuth(req, res, next) { if (!adminToken) return res.status(403).json({ ok: false, error: 'ADMIN_MUTATIONS_DISABLED' }); if (!safeEqual(req.get('x-admin-token'), adminToken)) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' }); return next() }
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'chat-ai', version: process.env.RELEASE_VERSION || 'dev', uptimeSeconds: Math.round(process.uptime()), now: new Date().toISOString() }))
  app.get('/ready', (_req, res) => {
    const ai = getAIStatus(); const marketingStatus = marketing.getStatus(); const wa = whatsapp.getState(); const requireMarketing = envBool('REQUIRE_MARKETING_FOR_READY', true)
    const waReady = providerName === 'cloud' ? wa.configured === true : wa.connection === 'open'
    const ready = Boolean(ai.configured && waReady && control.automationEnabled && (!requireMarketing || marketingStatus.configured))
    return res.status(ready ? 200 : 503).json({ ok: ready, automationEnabled: control.automationEnabled, provider: providerName, checks: { ai: ai.configured, whatsapp: waReady, marketing: requireMarketing ? marketingStatus.configured : true } })
  })
  app.get('/status', scannerAuth, (_req, res) => res.json({ ok: true, release: process.env.RELEASE_VERSION || 'dev', automation: { enabled: control.automationEnabled }, whatsapp: whatsapp.getState(), ai: getAIStatus(), marketing: marketing.getStatus(), metrics: metrics.snapshot() }))
  app.get('/metrics', scannerAuth, (_req, res) => res.json({ ok: true, metrics: metrics.snapshot() }))
  app.get('/qr', scannerAuth, async (_req, res) => {
    const qr = whatsapp.getQr?.()
    if (!qr) return res.status(404).json({ ok: false, error: providerName === 'cloud' ? 'QR_NOT_USED_BY_CLOUD_API' : 'QR_NOT_AVAILABLE', whatsapp: whatsapp.getState() })
    try { const dataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 2, width: 360 }); return res.json({ ok: true, qr: dataUrl }) }
    catch (error) { logger.error({ err: error }, 'QR rendering failed'); return res.status(500).json({ ok: false, error: 'QR_RENDER_FAILED' }) }
  })
  app.post('/marketing/preview', scannerAuth, async (req, res) => {
    if (!marketing.isEnabled()) return res.status(409).json({ ok: false, error: 'MARKETING_AGENT_DISABLED' })
    const text = String(req.body?.text || '').trim().slice(0, 6000)
    const sessionId = String(req.body?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || 'default'
    if (!text) return res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' })
    try { const jid = `preview:${sessionId}`; const result = await marketing.processDetailed({ jid, text }); return res.json({ ok: true, reply: result.reply, event: result.event, state: result.state }) }
    catch (error) { logger.error({ err: error }, 'Marketing preview failed'); return res.status(500).json({ ok: false, error: 'MARKETING_PREVIEW_FAILED' }) }
  })
  app.post('/admin/automation', scannerAuth, adminAuth, (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ ok: false, error: 'BOOLEAN_ENABLED_REQUIRED' })
    control.automationEnabled = req.body.enabled; logger.warn({ enabled: control.automationEnabled }, 'Automation kill switch changed')
    return res.json({ ok: true, automationEnabled: control.automationEnabled })
  })
  app.post('/admin/handoff/resume', scannerAuth, adminAuth, (req, res) => {
    const contactId = String(req.body?.contactId || '').trim().slice(0, 300)
    if (!contactId) return res.status(400).json({ ok: false, error: 'CONTACT_ID_REQUIRED' })
    return res.json({ ok: true, state: marketing.resumeHumanHandoff(contactId) })
  })
  app.post('/reconnect', scannerAuth, adminAuth, async (_req, res) => {
    try { const state = await whatsapp.reconnect(); return res.json({ ok: true, whatsapp: state }) }
    catch (error) { logger.error({ err: error }, 'Manual reconnect failed'); return res.status(500).json({ ok: false, error: 'RECONNECT_FAILED' }) }
  })
  app.use((error, _req, res, _next) => { logger.error({ err: error }, 'HTTP request failed'); res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' }) })
  return app
}
