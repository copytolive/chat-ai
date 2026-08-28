import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

function fakeRuntime() {
  return {
    logger: { info() {}, warn() {}, error() {} },
    metrics: { snapshot: () => ({ messagesReceived: 0, repliesSent: 0, failures: 0 }) },
    marketing: {
      isEnabled: () => false,
      getStatus: () => ({ enabled: false, configured: false, sessionPersistence: 'test' }),
      processDetailed: async () => ({ reply: null, event: 'disabled', state: null }),
      resumeHumanHandoff: () => null,
    },
    handoff: {
      getState: () => ({ mode: 'local', configured: true, localInbox: true, queue: { encrypted: true, pending: 0 } }),
      listPending: () => [],
      acknowledge: () => false,
    },
    whatsapp: {
      getState: () => ({ provider: 'baileys', connection: 'qr', hasQr: true, accountPaired: false }),
      getQr: () => 'PREFIX-QR',
      mountRoutes: () => {},
      reconnect: async () => ({ connection: 'qr' }),
    },
    control: { automationEnabled: true },
    providerName: 'baileys',
  }
}

test('legacy /wa-scanner prefix serves console and API aliases', async () => {
  const oldScanner = process.env.SCANNER_TOKEN
  const oldAdmin = process.env.ADMIN_TOKEN
  delete process.env.SCANNER_TOKEN
  delete process.env.ADMIN_TOKEN
  const server = createApp({ runtime: fakeRuntime() }).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  try {
    const page = await fetch(`http://127.0.0.1:${port}/wa-scanner/`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /WhatsApp AI Marketing Agent/)

    const health = await fetch(`http://127.0.0.1:${port}/wa-scanner/health`)
    assert.equal(health.status, 200)
    assert.equal((await health.json()).service, 'chat-ai')

    const status = await fetch(`http://127.0.0.1:${port}/wa-scanner/status`)
    assert.equal(status.status, 200)
    assert.equal((await status.json()).whatsapp.provider, 'baileys')

    const qr = await fetch(`http://127.0.0.1:${port}/wa-scanner/qr`)
    assert.equal(qr.status, 200)
    assert.match((await qr.json()).qr, /^data:image\/png;base64,/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (oldScanner == null) delete process.env.SCANNER_TOKEN; else process.env.SCANNER_TOKEN = oldScanner
    if (oldAdmin == null) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = oldAdmin
  }
})
