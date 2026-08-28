import test from 'node:test'
import assert from 'node:assert/strict'
import { completeChat } from '../src/ai.js'

test('AI fallback is used when primary fails', async () => {
  const oldFetch = globalThis.fetch
  const oldEnv = { ...process.env }
  process.env.AI_ENABLED = 'true'; process.env.AI_BASE_URL = 'http://primary/v1'; process.env.AI_MODEL = 'primary'; process.env.AI_FALLBACK_BASE_URL = 'http://fallback/v1'; process.env.AI_FALLBACK_MODEL = 'fallback'
  let calls = 0
  globalThis.fetch = async (url) => { calls += 1; if (String(url).includes('primary')) return new Response('down', { status: 503 }); return new Response(JSON.stringify({ choices: [{ message: { content: 'fallback ok' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try { assert.equal(await completeChat([{ role: 'user', content: 'hello' }]), 'fallback ok'); assert.equal(calls, 2) }
  finally { globalThis.fetch = oldFetch; process.env = oldEnv }
})
