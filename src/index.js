import 'dotenv/config'
import { createApp, createRuntime } from './app.js'

const runtime = createRuntime()
const app = createApp({ runtime })
const port = Number(process.env.PORT || 3847)
const host = process.env.HOST || '127.0.0.1'
const scannerToken = String(process.env.SCANNER_TOKEN || '').trim()
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])
if (!loopbackHosts.has(host) && !scannerToken) throw new Error('Refusing non-loopback bind without SCANNER_TOKEN')

const server = app.listen(port, host, () => runtime.logger.info({ host, port, provider: runtime.providerName, scannerAuth: Boolean(scannerToken) }, 'chat-ai HTTP service listening'))
runtime.whatsapp.start().catch((error) => runtime.logger.error({ err: error }, 'Initial WhatsApp provider start failed; HTTP service remains available'))
function shutdown(signal) {
  runtime.logger.info({ signal }, 'Shutting down')
  runtime.whatsapp.stop?.()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
