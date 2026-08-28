import test from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppService } from '../src/wa.js'

class MockEvents {
  constructor() { this.handlers = new Map() }
  on(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(handler) }
  async emit(name, payload) { for (const handler of this.handlers.get(name) || []) await handler(payload) }
}

test('QR scan transitions to connected and automatic inbound replies', async () => {
  const ev = new MockEvents()
  const sent = []
  const authPaths = []
  const socket = {
    ev,
    user: { id: '628123@s.whatsapp.net' },
    sendMessage: async (...args) => { sent.push(args) },
    end: () => {},
  }
  const metrics = { counters: {}, inc(name) { this.counters[name] = (this.counters[name] || 0) + 1 }, observeLatency() {} }
  const service = createWhatsAppService({
    authDir: '/data/wa-auth',
    onMessage: async ({ text }) => `AUTO:${text}`,
    makeSocket: () => socket,
    loadAuthState: async (path) => { authPaths.push(path); return { state: {}, saveCreds: async () => {} } },
    metrics,
    logger: { info() {}, error() {} },
  })

  await service.start()
  await ev.emit('connection.update', { qr: 'VALID-PAIRING-PAYLOAD' })
  assert.equal(service.getState().connection, 'qr')
  assert.equal(service.getState().hasQr, true)
  assert.equal(service.getQr(), 'VALID-PAIRING-PAYLOAD')

  await ev.emit('connection.update', { connection: 'open' })
  assert.equal(service.getState().connection, 'open')
  assert.equal(service.getState().accountPaired, true)
  assert.equal(service.getState().autoReconnect, true)
  assert.equal(service.getState().sessionPersistence, '/data/wa-auth')
  assert.deepEqual(authPaths, ['/data/wa-auth'])

  await ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{ key: { remoteJid: '628999@s.whatsapp.net', fromMe: false, id: 'msg-1' }, message: { conversation: 'Halo' } }],
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0][0], '628999@s.whatsapp.net')
  assert.deepEqual(sent[0][1], { text: 'AUTO:Halo' })
  assert.equal(metrics.counters.messagesReceived, 1)
  assert.equal(metrics.counters.repliesSent, 1)

  await ev.emit('messages.upsert', {
    type: 'notify',
    messages: [{ key: { remoteJid: '628999@s.whatsapp.net', fromMe: false, id: 'msg-1' }, message: { conversation: 'Halo' } }],
  })
  assert.equal(sent.length, 1)
  assert.equal(metrics.counters.duplicateMessages, 1)
  service.stop()
})
