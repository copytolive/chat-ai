import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function eventKey(id, payload) {
  return crypto.createHash('sha256').update(String(id || JSON.stringify(payload))).digest('hex')
}
function parseEncryptionKey(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  let key
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex')
  else {
    try { key = Buffer.from(raw, 'base64') } catch { key = null }
  }
  if (!key || key.length !== 32) throw new Error('WA_QUEUE_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)')
  return key
}

export function createDurableQueue({ dir = process.env.WA_QUEUE_DIR || './data/webhook-queue', encryptionKey = process.env.WA_QUEUE_ENCRYPTION_KEY || '', now = () => Date.now(), processedTtlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const resolved = path.resolve(dir)
  const processedFile = path.join(resolved, 'processed.json')
  const key = parseEncryptionKey(encryptionKey)
  let processed = {}
  let timer = null
  let busy = false
  let initialized = false

  function seal(item) {
    if (!key) return `${JSON.stringify({ encrypted: false, item })}\n`
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(item), 'utf8'), cipher.final()])
    return `${JSON.stringify({ encrypted: true, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })}\n`
  }
  function open(raw) {
    const envelope = JSON.parse(raw)
    if (!envelope.encrypted) return envelope.item
    if (!key) throw new Error('Queue item is encrypted but WA_QUEUE_ENCRYPTION_KEY is unavailable')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
  }
  function persistProcessed() {
    const tmp = `${processedFile}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(processed)}\n`, { mode: 0o600 })
    fs.renameSync(tmp, processedFile)
  }
  function cleanupProcessed() {
    const cutoff = now() - processedTtlMs
    let changed = false
    for (const [id, timestamp] of Object.entries(processed)) if (Number(timestamp) < cutoff) { delete processed[id]; changed = true }
    const ids = Object.keys(processed)
    if (ids.length > 10_000) {
      ids.sort((a, b) => processed[a] - processed[b])
      for (const id of ids.slice(0, ids.length - 10_000)) delete processed[id]
      changed = true
    }
    if (changed) persistProcessed()
  }
  function init() {
    if (initialized) return
    fs.mkdirSync(resolved, { recursive: true })
    try { processed = JSON.parse(fs.readFileSync(processedFile, 'utf8')) || {} } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      persistProcessed()
    }
    cleanupProcessed()
    initialized = true
  }
  function pendingFiles() {
    init()
    return fs.readdirSync(resolved).filter((name) => /^[a-f0-9]{64}\.queue$/.test(name)).sort()
  }
  function enqueue(payload, { id } = {}) {
    init()
    const keyId = eventKey(id, payload)
    if (processed[keyId]) return { id: keyId, duplicate: true }
    const file = path.join(resolved, `${keyId}.queue`)
    const item = { id: keyId, attempts: 0, nextAttemptAt: now(), enqueuedAt: now(), payload }
    try {
      fs.writeFileSync(file, seal(item), { flag: 'wx', mode: 0o600 })
      return { id: keyId, duplicate: false }
    } catch (error) {
      if (error?.code === 'EEXIST') return { id: keyId, duplicate: true }
      throw error
    }
  }
  async function drainOnce(handler) {
    init()
    if (busy) return
    busy = true
    try {
      for (const name of pendingFiles()) {
        const file = path.join(resolved, name)
        let item
        try { item = open(fs.readFileSync(file, 'utf8')) } catch { continue }
        if (Number(item.nextAttemptAt || 0) > now()) continue
        try {
          await handler(item.payload)
          processed[item.id] = now()
          persistProcessed()
          try { fs.unlinkSync(file) } catch {}
        } catch {
          item.attempts = Number(item.attempts || 0) + 1
          item.nextAttemptAt = now() + Math.min(60_000, 2000 * (2 ** Math.min(item.attempts, 5)))
          const tmp = `${file}.${process.pid}.tmp`
          fs.writeFileSync(tmp, seal(item), { mode: 0o600 })
          fs.renameSync(tmp, file)
        }
      }
    } finally { busy = false }
  }
  function start(handler) {
    init()
    if (timer) return
    timer = setInterval(() => { drainOnce(handler).catch(() => {}) }, 500)
    timer.unref?.()
    drainOnce(handler).catch(() => {})
  }
  function stop() { if (timer) clearInterval(timer); timer = null }
  function stats() { return { pending: pendingFiles().length, processedRecent: Object.keys(processed).length, persistence: 'durable-file-queue', encrypted: Boolean(key) } }
  return { init, enqueue, drainOnce, start, stop, stats, encrypted: Boolean(key), dir: resolved }
}
