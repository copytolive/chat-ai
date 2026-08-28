import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function emptyState() { return { version: 2, contacts: {} } }
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function contactKey(contactId) { return crypto.createHash('sha256').update(String(contactId || '')).digest('hex') }
function isHashedKey(value) { return /^[a-f0-9]{64}$/.test(String(value || '')) }

export function createDurableStateStore({ filePath = process.env.STATE_FILE || './data/state.json', now = () => Date.now() } = {}) {
  const resolved = path.resolve(filePath)
  let state = emptyState()
  let migrated = false
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'))
    state = { version: 2, contacts: safeObject(parsed?.contacts) }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  // v1 stored raw phone/JID values as object keys. Migrate them immediately so
  // a restart upgrades privacy without losing opt-out/handoff state.
  for (const [key, value] of Object.entries({ ...state.contacts })) {
    if (isHashedKey(key)) continue
    const hashed = contactKey(key)
    state.contacts[hashed] = { ...safeObject(value), ...safeObject(state.contacts[hashed]) }
    delete state.contacts[key]
    migrated = true
  }

  function persist() {
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(tmp, resolved)
  }
  if (migrated) persist()

  function get(contactId) {
    const item = state.contacts[contactKey(contactId)]
    return item ? structuredClone(item) : null
  }
  function patch(contactId, updates = {}) {
    const key = contactKey(contactId)
    const current = safeObject(state.contacts[key])
    const next = { ...current, ...safeObject(updates), updatedAt: new Date(now()).toISOString() }
    state.contacts[key] = next
    persist()
    return structuredClone(next)
  }
  function setOptOut(contactId, optedOut = true) {
    return patch(contactId, { optedOut: Boolean(optedOut), automationPaused: Boolean(optedOut), pauseReason: optedOut ? 'opt_out' : null, optedOutAt: optedOut ? new Date(now()).toISOString() : null })
  }
  function setHandoff(contactId, handoff = true) {
    return patch(contactId, { handoff: Boolean(handoff), automationPaused: Boolean(handoff), pauseReason: handoff ? 'human_handoff' : null, handoffAt: handoff ? new Date(now()).toISOString() : null })
  }
  function resume(contactId) {
    return patch(contactId, { handoff: false, automationPaused: false, pauseReason: null, handoffAt: null })
  }
  function stats() {
    const contacts = Object.values(state.contacts)
    return { contacts: contacts.length, optedOut: contacts.filter((item) => item?.optedOut).length, handoff: contacts.filter((item) => item?.handoff).length, automationPaused: contacts.filter((item) => item?.automationPaused).length, persistence: 'durable-json-single-instance-hashed-contact-id', contactIdentifiers: 'sha256', pathConfigured: Boolean(filePath) }
  }
  return { get, patch, setOptOut, setHandoff, resume, stats, filePath: resolved }
}
