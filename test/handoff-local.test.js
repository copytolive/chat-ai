import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHandoffService } from '../src/handoff.js'

test('local handoff inbox is encrypted, durable and acknowledgeable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-ai-handoff-'))
  const before = { ...process.env }
  try {
    process.env.NODE_ENV = 'production'
    process.env.HANDOFF_MODE = 'local'
    process.env.HANDOFF_QUEUE_DIR = dir
    process.env.HANDOFF_QUEUE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    process.env.HANDOFF_REQUIRE_ENCRYPTED_QUEUE = 'true'
    const handoff = createHandoffService({ logger: { error() {} } })
    handoff.start()
    assert.equal(handoff.getState().configured, true)
    assert.equal(handoff.getState().localInbox, true)
    assert.equal(handoff.getState().queue.encrypted, true)

    const queued = handoff.enqueue({ contactId: '628123', text: 'Saya mau bicara admin', state: { stage: 8 }, messageId: 'wamid.local.1' })
    assert.equal(queued.duplicate, false)
    const items = handoff.listPending()
    assert.equal(items.length, 1)
    assert.equal(items[0].payload.contactId, '628123')
    assert.match(items[0].payload.message, /bicara admin/)

    const rawQueueFile = fs.readFileSync(path.join(dir, `${queued.id}.queue`), 'utf8')
    assert.doesNotMatch(rawQueueFile, /628123|bicara admin/)
    assert.equal(handoff.acknowledge(queued.id), true)
    assert.equal(handoff.listPending().length, 0)
    handoff.stop()
  } finally {
    process.env = before
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
